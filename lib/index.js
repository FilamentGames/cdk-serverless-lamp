"use strict";
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseCluster = exports.ServerlessLaravel = exports.ServerlessApi = void 0;
const JSII_RTTI_SYMBOL_1 = Symbol.for("jsii.rtti");
const path = require("path");
const apigateway = require("@aws-cdk/aws-apigatewayv2-alpha");
const aws_apigatewayv2_integrations_alpha_1 = require("@aws-cdk/aws-apigatewayv2-integrations-alpha");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const constructs_1 = require("constructs");
/**
 * Use `ServerlessApi` to create the serverless API resource
 */
class ServerlessApi extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const DEFAULT_LAMBDA_ASSET_PATH = path.join(__dirname, '../composer/laravel58-bref');
        const DEFAULT_DB_MASTER_USER = 'admin';
        this.vpc = props.vpc;
        this.handler = props.handler ?? new aws_cdk_lib_1.aws_lambda.Function(this, 'handler', {
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.PROVIDED_AL2,
            handler: 'public/index.php',
            layers: [
                aws_cdk_lib_1.aws_lambda.LayerVersion.fromLayerVersionArn(this, 'BrefPHPLayer', props.brefLayerVersion),
            ],
            code: aws_cdk_lib_1.aws_lambda.Code.fromAsset(props?.lambdaCodePath ?? DEFAULT_LAMBDA_ASSET_PATH),
            environment: {
                APP_STORAGE: '/tmp',
                DB_WRITER: props.databaseConfig?.writerEndpoint ?? '',
                DB_READER: props.databaseConfig?.readerEndpoint ?? props.databaseConfig?.writerEndpoint ?? '',
                DB_USER: props.databaseConfig?.masterUserName ?? DEFAULT_DB_MASTER_USER,
            },
            timeout: aws_cdk_lib_1.Duration.seconds(120),
            vpc: props.vpc,
        });
        // allow lambda execution role to connect to RDS proxy
        if (props.rdsProxy) {
            this.handler.addToRolePolicy(new aws_cdk_lib_1.aws_iam.PolicyStatement({
                actions: ['rds-db:connect'],
                resources: [props.rdsProxy.dbProxyArn],
            }));
        }
        const endpoint = this.endpoint = new apigateway.HttpApi(this, 'apiservice', {
            defaultIntegration: new aws_apigatewayv2_integrations_alpha_1.HttpLambdaIntegration('lambdaHandler', this.handler),
        });
        new aws_cdk_lib_1.CfnOutput(this, 'EndpointURL', { value: endpoint.url });
    }
}
exports.ServerlessApi = ServerlessApi;
_a = JSII_RTTI_SYMBOL_1;
ServerlessApi[_a] = { fqn: "cdk-serverless-lamp.ServerlessApi", version: "0.0.0" };
/**
 * Use `ServerlessLaravel` to create the serverless Laravel resource
 */
class ServerlessLaravel extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        this.api = new ServerlessApi(this, id, {
            lambdaCodePath: props.laravelPath,
            brefLayerVersion: props.brefLayerVersion,
            handler: props.handler,
            vpc: props.vpc,
            databaseConfig: props.databaseConfig,
            rdsProxy: props.rdsProxy,
        });
    }
}
exports.ServerlessLaravel = ServerlessLaravel;
_b = JSII_RTTI_SYMBOL_1;
ServerlessLaravel[_b] = { fqn: "cdk-serverless-lamp.ServerlessLaravel", version: "0.0.0" };
class DatabaseCluster extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        this.masterUser = props.masterUserName ?? 'admin';
        // generate and store password for masterUser in the secrets manager
        const masterUserSecret = new aws_cdk_lib_1.aws_secretsmanager.Secret(this, 'DbMasterSecret', {
            secretName: `${aws_cdk_lib_1.Stack.of(this).stackName}-DbMasterSecret`,
            generateSecretString: {
                secretStringTemplate: JSON.stringify({
                    username: this.masterUser,
                }),
                passwordLength: 12,
                excludePunctuation: true,
                includeSpace: false,
                generateStringKey: 'password',
            },
        });
        this.masterPassword = masterUserSecret;
        const dbConnectionGroup = new aws_cdk_lib_1.aws_ec2.SecurityGroup(this, 'DB Security Group', {
            vpc: props.vpc,
        });
        dbConnectionGroup.connections.allowInternally(aws_cdk_lib_1.aws_ec2.Port.tcp(3306));
        const dbCluster = new aws_cdk_lib_1.aws_rds.DatabaseCluster(this, 'DBCluster', {
            engine: props.engine ?? aws_cdk_lib_1.aws_rds.DatabaseClusterEngine.auroraMysql({
                version: aws_cdk_lib_1.aws_rds.AuroraMysqlEngineVersion.VER_2_08_1,
            }),
            instanceProps: {
                vpc: props.vpc,
                instanceType: props.instanceType ?? new aws_cdk_lib_1.aws_ec2.InstanceType('t3.medium'),
                securityGroups: [dbConnectionGroup],
                vpcSubnets: props.vpcSubnets,
            },
            credentials: aws_cdk_lib_1.aws_rds.Credentials.fromSecret(masterUserSecret),
            instances: props.instanceCapacity,
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
        });
        // Workaround for bug where TargetGroupName is not set but required
        let cfnDbInstance = dbCluster.node.children.find((child) => {
            return child instanceof aws_cdk_lib_1.aws_rds.CfnDBInstance;
        });
        // enable the RDS proxy by default
        if (props.rdsProxy !== false) {
            // create iam role for RDS proxy
            const rdsProxyRole = new aws_cdk_lib_1.aws_iam.Role(this, 'RdsProxyRole', {
                assumedBy: new aws_cdk_lib_1.aws_iam.ServicePrincipal('rds.amazonaws.com'),
            });
            // see: https://aws.amazon.com/tw/blogs/compute/using-amazon-rds-proxy-with-aws-lambda/
            rdsProxyRole.addToPolicy(new aws_cdk_lib_1.aws_iam.PolicyStatement({
                actions: [
                    'secretsmanager:GetResourcePolicy',
                    'secretsmanager:GetSecretValue',
                    'secretsmanager:DescribeSecret',
                    'secretsmanager:ListSecretVersionIds',
                ],
                resources: [masterUserSecret.secretArn],
            }));
            const proxyOptions = {
                vpc: props.vpc,
                secrets: [masterUserSecret],
                iamAuth: true,
                dbProxyName: `${aws_cdk_lib_1.Stack.of(this).stackName}-RDSProxy`,
                securityGroups: [dbConnectionGroup],
                role: rdsProxyRole,
                vpcSubnets: props.vpcSubnets,
            };
            // create the RDS proxy
            this.rdsProxy = dbCluster.addProxy('RDSProxy', proxyOptions);
            // ensure DB instance is ready before creating the proxy
            this.rdsProxy?.node.addDependency(cfnDbInstance);
        }
    }
}
exports.DatabaseCluster = DatabaseCluster;
_c = JSII_RTTI_SYMBOL_1;
DatabaseCluster[_c] = { fqn: "cdk-serverless-lamp.DatabaseCluster", version: "0.0.0" };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFDQSw2QkFBNkI7QUFDN0IsOERBQThEO0FBQzlELHNHQUFxRjtBQUNyRiw2Q0FPcUI7QUFDckIsMkNBQXVDO0FBcUV2Qzs7R0FFRztBQUNILE1BQWEsYUFBYyxTQUFRLHNCQUFTO0lBSzFDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBeUI7UUFDakUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLHlCQUF5QixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLDRCQUE0QixDQUFDLENBQUM7UUFDckYsTUFBTSxzQkFBc0IsR0FBRyxPQUFPLENBQUM7UUFFdkMsSUFBSSxDQUFDLEdBQUcsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDO1FBRXJCLElBQUksQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQU8sSUFBSSxJQUFJLHdCQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUU7WUFDbkUsT0FBTyxFQUFFLHdCQUFNLENBQUMsT0FBTyxDQUFDLFlBQVk7WUFDcEMsT0FBTyxFQUFFLGtCQUFrQjtZQUMzQixNQUFNLEVBQUU7Z0JBQ04sd0JBQU0sQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsZ0JBQWdCLENBQUM7YUFDdEY7WUFDRCxJQUFJLEVBQUUsd0JBQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxjQUFjLElBQUkseUJBQXlCLENBQUM7WUFDL0UsV0FBVyxFQUFFO2dCQUNYLFdBQVcsRUFBRSxNQUFNO2dCQUNuQixTQUFTLEVBQUUsS0FBSyxDQUFDLGNBQWMsRUFBRSxjQUFjLElBQUksRUFBRTtnQkFDckQsU0FBUyxFQUFFLEtBQUssQ0FBQyxjQUFjLEVBQUUsY0FBYyxJQUFJLEtBQUssQ0FBQyxjQUFjLEVBQUUsY0FBYyxJQUFJLEVBQUU7Z0JBQzdGLE9BQU8sRUFBRSxLQUFLLENBQUMsY0FBYyxFQUFFLGNBQWMsSUFBSSxzQkFBc0I7YUFDeEU7WUFDRCxPQUFPLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDO1lBQzlCLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRztTQUNmLENBQUMsQ0FBQztRQUVILHNEQUFzRDtRQUN0RCxJQUFJLEtBQUssQ0FBQyxRQUFRLEVBQUU7WUFDbEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsSUFBSSxxQkFBRyxDQUFDLGVBQWUsQ0FBQztnQkFDbkQsT0FBTyxFQUFFLENBQUMsZ0JBQWdCLENBQUM7Z0JBQzNCLFNBQVMsRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDO2FBQ3ZDLENBQUMsQ0FBQyxDQUFDO1NBQ0w7UUFFRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQzFFLGtCQUFrQixFQUFFLElBQUksMkRBQXFCLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUM7U0FDN0UsQ0FBQyxDQUFDO1FBQ0gsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUUsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLEdBQUksRUFBRSxDQUFDLENBQUM7SUFDL0QsQ0FBQzs7QUExQ0gsc0NBMkNDOzs7QUFhRDs7R0FFRztBQUNILE1BQWEsaUJBQWtCLFNBQVEsc0JBQVM7SUFHOUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE2QjtRQUNyRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2pCLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxhQUFhLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRTtZQUNyQyxjQUFjLEVBQUUsS0FBSyxDQUFDLFdBQVc7WUFDakMsZ0JBQWdCLEVBQUUsS0FBSyxDQUFDLGdCQUFnQjtZQUN4QyxPQUFPLEVBQUUsS0FBSyxDQUFDLE9BQU87WUFDdEIsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO1lBQ2QsY0FBYyxFQUFFLEtBQUssQ0FBQyxjQUFjO1lBQ3BDLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUTtTQUN6QixDQUFDLENBQUM7SUFDTCxDQUFDOztBQWJILDhDQWNDOzs7QUF1REQsTUFBYSxlQUFnQixTQUFRLHNCQUFTO0lBSzVDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBb0I7UUFDNUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixJQUFJLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQyxjQUFjLElBQUksT0FBTyxDQUFDO1FBRWxELG9FQUFvRTtRQUNwRSxNQUFNLGdCQUFnQixHQUFHLElBQUksZ0NBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQ3pFLFVBQVUsRUFBRSxHQUFHLG1CQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLFNBQVMsaUJBQWlCO1lBQ3hELG9CQUFvQixFQUFFO2dCQUNwQixvQkFBb0IsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO29CQUNuQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFVBQVU7aUJBQzFCLENBQUM7Z0JBQ0YsY0FBYyxFQUFFLEVBQUU7Z0JBQ2xCLGtCQUFrQixFQUFFLElBQUk7Z0JBQ3hCLFlBQVksRUFBRSxLQUFLO2dCQUNuQixpQkFBaUIsRUFBRSxVQUFVO2FBQzlCO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGNBQWMsR0FBRyxnQkFBZ0IsQ0FBQztRQUV2QyxNQUFNLGlCQUFpQixHQUFHLElBQUkscUJBQUcsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQ3pFLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRztTQUNmLENBQUMsQ0FBQztRQUNILGlCQUFpQixDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMscUJBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFFbEUsTUFBTSxTQUFTLEdBQUcsSUFBSSxxQkFBRyxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsV0FBVyxFQUFFO1lBQzNELE1BQU0sRUFBRSxLQUFLLENBQUMsTUFBTSxJQUFJLHFCQUFHLENBQUMscUJBQXFCLENBQUMsV0FBVyxDQUFDO2dCQUM1RCxPQUFPLEVBQUUscUJBQUcsQ0FBQyx3QkFBd0IsQ0FBQyxVQUFVO2FBQ2pELENBQUM7WUFDRixhQUFhLEVBQUU7Z0JBQ2IsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO2dCQUNkLFlBQVksRUFBRSxLQUFLLENBQUMsWUFBWSxJQUFJLElBQUkscUJBQUcsQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDO2dCQUNyRSxjQUFjLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQztnQkFDbkMsVUFBVSxFQUFFLEtBQUssQ0FBQyxVQUFVO2FBQzdCO1lBQ0QsV0FBVyxFQUFFLHFCQUFHLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQztZQUN6RCxTQUFTLEVBQUUsS0FBSyxDQUFDLGdCQUFnQjtZQUNqQyxhQUFhLEVBQUUsMkJBQWEsQ0FBQyxPQUFPO1NBQ3JDLENBQUMsQ0FBQztRQUVILG1FQUFtRTtRQUNuRSxJQUFJLGFBQWEsR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFVLEVBQUUsRUFBRTtZQUM5RCxPQUFPLEtBQUssWUFBWSxxQkFBRyxDQUFDLGFBQWEsQ0FBQztRQUM1QyxDQUFDLENBQXNCLENBQUM7UUFFeEIsa0NBQWtDO1FBQ2xDLElBQUksS0FBSyxDQUFDLFFBQVEsS0FBSyxLQUFLLEVBQUU7WUFDNUIsZ0NBQWdDO1lBQ2hDLE1BQU0sWUFBWSxHQUFHLElBQUkscUJBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtnQkFDdEQsU0FBUyxFQUFFLElBQUkscUJBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxtQkFBbUIsQ0FBQzthQUN6RCxDQUFDLENBQUM7WUFDSCx1RkFBdUY7WUFDdkYsWUFBWSxDQUFDLFdBQVcsQ0FBQyxJQUFJLHFCQUFHLENBQUMsZUFBZSxDQUFDO2dCQUMvQyxPQUFPLEVBQUU7b0JBQ1Asa0NBQWtDO29CQUNsQywrQkFBK0I7b0JBQy9CLCtCQUErQjtvQkFDL0IscUNBQXFDO2lCQUN0QztnQkFDRCxTQUFTLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUM7YUFDeEMsQ0FBQyxDQUFDLENBQUM7WUFFSixNQUFNLFlBQVksR0FBNkI7Z0JBQzdDLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRztnQkFDZCxPQUFPLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQztnQkFDM0IsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsV0FBVyxFQUFFLEdBQUcsbUJBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsU0FBUyxXQUFXO2dCQUNuRCxjQUFjLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQztnQkFDbkMsSUFBSSxFQUFFLFlBQVk7Z0JBQ2xCLFVBQVUsRUFBRSxLQUFLLENBQUMsVUFBVTthQUM3QixDQUFDO1lBRUYsdUJBQXVCO1lBQ3ZCLElBQUksQ0FBQyxRQUFRLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsWUFBWSxDQUFDLENBQUM7WUFDN0Qsd0RBQXdEO1lBQ3hELElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQztTQUNsRDtJQUNILENBQUM7O0FBbkZILDBDQW9GQyIsInNvdXJjZXNDb250ZW50IjpbIlxuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXl2Mi1hbHBoYSc7XG5pbXBvcnQgeyBIdHRwTGFtYmRhSW50ZWdyYXRpb24gfSBmcm9tICdAYXdzLWNkay9hd3MtYXBpZ2F0ZXdheXYyLWludGVncmF0aW9ucy1hbHBoYSc7XG5pbXBvcnQge1xuICBTdGFjaywgQ2ZuT3V0cHV0LCBEdXJhdGlvbiwgUmVtb3ZhbFBvbGljeSxcbiAgYXdzX2VjMiBhcyBlYzIsXG4gIGF3c19pYW0gYXMgaWFtLFxuICBhd3NfbGFtYmRhIGFzIGxhbWJkYSxcbiAgYXdzX3JkcyBhcyByZHMsXG4gIGF3c19zZWNyZXRzbWFuYWdlciBhcyBzZWNyZXRzbWFuYWdlcixcbn0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cblxuZXhwb3J0IGludGVyZmFjZSBEYXRhYmFzZUNvbmZpZyB7XG4gIC8qKlxuICAgKiBUaGUgREIgd3JpdGVyIGVuZHBvaW50XG4gICAqL1xuICByZWFkb25seSB3cml0ZXJFbmRwb2ludDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgREIgcmVhZGVyIGVuZHBvaW50XG4gICAqL1xuICByZWFkb25seSByZWFkZXJFbmRwb2ludD86IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIERCIG1hc3RlciB1c2VybmFtZVxuICAgKi9cbiAgcmVhZG9ubHkgbWFzdGVyVXNlck5hbWU/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBEQiBtYXN0ZXIgcGFzc3dvcmQgc2VjcmV0XG4gICAqL1xuICByZWFkb25seSBtYXN0ZXJVc2VyUGFzc3dvcmRTZWNyZXQ/OiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xufVxuXG4vKipcbiAqIENvbnN0cnVjdCBwcm9wZXJ0aWVzIGZvciBgU2VydmVybGVzc0FwaWBcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTZXJ2ZXJsZXNzQXBpUHJvcHMge1xuICAvKipcbiAgICogY3VzdG9tIGxhbWJkYSBmdW5jdGlvbiBmb3IgdGhlIEFQSVxuICAgKlxuICAgKiBAZGVmYXVsdCAtIEEgTGFtYmRhIGZ1bmN0aW9uIHdpdGggTGF2YXZlbCBhbmQgQnJlZiBzdXBwb3J0IHdpbGwgYmUgY3JlYXRlZFxuICAgKi9cbiAgcmVhZG9ubHkgaGFuZGxlcj86IGxhbWJkYS5JRnVuY3Rpb247XG5cbiAgLyoqXG4gICAqIGN1c3RvbSBsYW1iZGEgY29kZSBhc3NldCBwYXRoXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gREVGQVVMVF9MQU1CREFfQVNTRVRfUEFUSFxuICAgKi9cbiAgcmVhZG9ubHkgbGFtYmRhQ29kZVBhdGg/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEFXUyBMYW1iZGEgbGF5ZXIgdmVyc2lvbiBmcm9tIHRoZSBCcmVmIHJ1bnRpbWUuXG4gICAqIGUuZy4gYXJuOmF3czpsYW1iZGE6dXMtd2VzdC0xOjIwOTQ5NzQwMDY5ODpsYXllcjpwaHAtNzQtZnBtOjEyXG4gICAqIGNoZWNrIHRoZSBsYXRlc3QgcnVudGltZSB2ZXJpb24gYXJuIGF0IGh0dHBzOi8vYnJlZi5zaC9kb2NzL3J1bnRpbWVzL1xuICAgKi9cbiAgcmVhZG9ubHkgYnJlZkxheWVyVmVyc2lvbjogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgVlBDIGZvciB0aGlzIHN0YWNrXG4gICAqL1xuICByZWFkb25seSB2cGM/OiBlYzIuSVZwYztcblxuICAvKipcbiAgICogRGF0YWJhc2UgY29uZmlndXJhdGlvbnNcbiAgICovXG4gIHJlYWRvbmx5IGRhdGFiYXNlQ29uZmlnPzogRGF0YWJhc2VDb25maWc7XG5cbiAgLyoqXG4gICAqIFJEUyBQcm94eSBmb3IgdGhlIExhbWJkYSBmdW5jdGlvblxuICAgKlxuICAgKiBAZGVmYXVsdCAtIG5vIGRiIHByb3h5XG4gICAqL1xuICByZWFkb25seSByZHNQcm94eT86IHJkcy5JRGF0YWJhc2VQcm94eTtcblxufVxuXG4vKipcbiAqIFVzZSBgU2VydmVybGVzc0FwaWAgdG8gY3JlYXRlIHRoZSBzZXJ2ZXJsZXNzIEFQSSByZXNvdXJjZVxuICovXG5leHBvcnQgY2xhc3MgU2VydmVybGVzc0FwaSBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHJlYWRvbmx5IGhhbmRsZXI6IGxhbWJkYS5JRnVuY3Rpb247XG4gIHJlYWRvbmx5IHZwYz86IGVjMi5JVnBjO1xuICByZWFkb25seSBlbmRwb2ludDogYXBpZ2F0ZXdheS5IdHRwQXBpO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTZXJ2ZXJsZXNzQXBpUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3QgREVGQVVMVF9MQU1CREFfQVNTRVRfUEFUSCA9IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9jb21wb3Nlci9sYXJhdmVsNTgtYnJlZicpO1xuICAgIGNvbnN0IERFRkFVTFRfREJfTUFTVEVSX1VTRVIgPSAnYWRtaW4nO1xuXG4gICAgdGhpcy52cGMgPSBwcm9wcy52cGM7XG5cbiAgICB0aGlzLmhhbmRsZXIgPSBwcm9wcy5oYW5kbGVyID8/IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ2hhbmRsZXInLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QUk9WSURFRF9BTDIsXG4gICAgICBoYW5kbGVyOiAncHVibGljL2luZGV4LnBocCcsXG4gICAgICBsYXllcnM6IFtcbiAgICAgICAgbGFtYmRhLkxheWVyVmVyc2lvbi5mcm9tTGF5ZXJWZXJzaW9uQXJuKHRoaXMsICdCcmVmUEhQTGF5ZXInLCBwcm9wcy5icmVmTGF5ZXJWZXJzaW9uKSxcbiAgICAgIF0sXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocHJvcHM/LmxhbWJkYUNvZGVQYXRoID8/IERFRkFVTFRfTEFNQkRBX0FTU0VUX1BBVEgpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgQVBQX1NUT1JBR0U6ICcvdG1wJyxcbiAgICAgICAgREJfV1JJVEVSOiBwcm9wcy5kYXRhYmFzZUNvbmZpZz8ud3JpdGVyRW5kcG9pbnQgPz8gJycsXG4gICAgICAgIERCX1JFQURFUjogcHJvcHMuZGF0YWJhc2VDb25maWc/LnJlYWRlckVuZHBvaW50ID8/IHByb3BzLmRhdGFiYXNlQ29uZmlnPy53cml0ZXJFbmRwb2ludCA/PyAnJyxcbiAgICAgICAgREJfVVNFUjogcHJvcHMuZGF0YWJhc2VDb25maWc/Lm1hc3RlclVzZXJOYW1lID8/IERFRkFVTFRfREJfTUFTVEVSX1VTRVIsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygxMjApLFxuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgfSk7XG5cbiAgICAvLyBhbGxvdyBsYW1iZGEgZXhlY3V0aW9uIHJvbGUgdG8gY29ubmVjdCB0byBSRFMgcHJveHlcbiAgICBpZiAocHJvcHMucmRzUHJveHkpIHtcbiAgICAgIHRoaXMuaGFuZGxlci5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbJ3Jkcy1kYjpjb25uZWN0J10sXG4gICAgICAgIHJlc291cmNlczogW3Byb3BzLnJkc1Byb3h5LmRiUHJveHlBcm5dLFxuICAgICAgfSkpO1xuICAgIH1cblxuICAgIGNvbnN0IGVuZHBvaW50ID0gdGhpcy5lbmRwb2ludCA9IG5ldyBhcGlnYXRld2F5Lkh0dHBBcGkodGhpcywgJ2FwaXNlcnZpY2UnLCB7XG4gICAgICBkZWZhdWx0SW50ZWdyYXRpb246IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ2xhbWJkYUhhbmRsZXInLCB0aGlzLmhhbmRsZXIpLFxuICAgIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0VuZHBvaW50VVJMJywgeyB2YWx1ZTogZW5kcG9pbnQudXJsISB9KTtcbiAgfVxufVxuXG4vKipcbiAqIENvbnN0cnVjdCBwcm9wZXJ0aWVzIGZvciBgU2VydmVybGVzc0xhcmF2ZWxgXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2VydmVybGVzc0xhcmF2ZWxQcm9wcyBleHRlbmRzIFNlcnZlcmxlc3NBcGlQcm9wcyB7XG4gIC8qKlxuICAgKiBwYXRoIHRvIHlvdXIgbG9jYWwgbGFyYXZlbCBkaXJlY3Rvcnkgd2l0aCBicmVmXG4gICAqL1xuICByZWFkb25seSBsYXJhdmVsUGF0aDogc3RyaW5nO1xuXG59XG5cbi8qKlxuICogVXNlIGBTZXJ2ZXJsZXNzTGFyYXZlbGAgdG8gY3JlYXRlIHRoZSBzZXJ2ZXJsZXNzIExhcmF2ZWwgcmVzb3VyY2VcbiAqL1xuZXhwb3J0IGNsYXNzIFNlcnZlcmxlc3NMYXJhdmVsIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcmVhZG9ubHkgYXBpOlNlcnZlcmxlc3NBcGk7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFNlcnZlcmxlc3NMYXJhdmVsUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuICAgIHRoaXMuYXBpID0gbmV3IFNlcnZlcmxlc3NBcGkodGhpcywgaWQsIHtcbiAgICAgIGxhbWJkYUNvZGVQYXRoOiBwcm9wcy5sYXJhdmVsUGF0aCxcbiAgICAgIGJyZWZMYXllclZlcnNpb246IHByb3BzLmJyZWZMYXllclZlcnNpb24sXG4gICAgICBoYW5kbGVyOiBwcm9wcy5oYW5kbGVyLFxuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICBkYXRhYmFzZUNvbmZpZzogcHJvcHMuZGF0YWJhc2VDb25maWcsXG4gICAgICByZHNQcm94eTogcHJvcHMucmRzUHJveHksXG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBEYXRhYmFzZVByb3BzIHtcbiAgLyoqXG4gICAqIGRhdGFiYXNlIGNsdXN0ZXIgZW5naW5lXG4gICAqXG4gICAqIEBkZWZhdWx0IEFVUk9SQV9NWVNRTFxuICAgKi9cbiAgcmVhZG9ubHkgZW5naW5lPzogcmRzLklDbHVzdGVyRW5naW5lO1xuXG4gIC8qKlxuICAgKiBtYXN0ZXIgdXNlcm5hbWVcbiAgICpcbiAgICogQGRlZmF1bHQgYWRtaW5cbiAgICovXG4gIHJlYWRvbmx5IG1hc3RlclVzZXJOYW1lPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgVlBDIGZvciB0aGUgRGF0YWJhc2VDbHVzdGVyXG4gICAqL1xuICByZWFkb25seSB2cGM6IGVjMi5JVnBjO1xuXG4gIC8qKlxuICAgKiBpbnN0YW5jZSB0eXBlIG9mIHRoZSBjbHVzdGVyXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gdDMubWVkaXVtIChvciwgbW9yZSBwcmVjaXNlbHksIGRiLnQzLm1lZGl1bSlcbiAgICovXG4gIHJlYWRvbmx5IGluc3RhbmNlVHlwZT86IGVjMi5JbnN0YW5jZVR5cGU7XG5cbiAgLyoqXG4gICAqIGVuYWJsZSB0aGUgQW1hem9uIFJEUyBwcm94eVxuICAgKlxuICAgKiBAZGVmYXVsdCB0cnVlXG4gICAqL1xuICByZWFkb25seSByZHNQcm94eT86IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIFJEUyBQcm94eSBPcHRpb25zXG4gICAqL1xuICByZWFkb25seSByZHNQcm94eU9wdGlvbnM/OiByZHMuRGF0YWJhc2VQcm94eU9wdGlvbnM7XG5cbiAgLyoqXG4gICAqIEhvdyBtYW55IHJlcGxpY2FzL2luc3RhbmNlcyB0byBjcmVhdGUuIEhhcyB0byBiZSBhdCBsZWFzdCAxLlxuICAgKlxuICAgKiBAZGVmYXVsdCAxXG4gICAqL1xuICByZWFkb25seSBpbnN0YW5jZUNhcGFjaXR5PzogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBMaXN0IG9mIHN1Ym5ldHMgdG8gdXNlIHdoZW4gY3JlYXRpbmcgc3VibmV0IGdyb3VwLlxuICAgKi9cbiAgcmVhZG9ubHkgdnBjU3VibmV0cz86IGVjMi5TdWJuZXRTZWxlY3Rpb247XG5cbn1cblxuZXhwb3J0IGNsYXNzIERhdGFiYXNlQ2x1c3RlciBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHJlYWRvbmx5IHJkc1Byb3h5PzogcmRzLkRhdGFiYXNlUHJveHk7XG4gIHJlYWRvbmx5IG1hc3RlclVzZXI6IHN0cmluZztcbiAgcmVhZG9ubHkgbWFzdGVyUGFzc3dvcmQ6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IERhdGFiYXNlUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgdGhpcy5tYXN0ZXJVc2VyID0gcHJvcHMubWFzdGVyVXNlck5hbWUgPz8gJ2FkbWluJztcblxuICAgIC8vIGdlbmVyYXRlIGFuZCBzdG9yZSBwYXNzd29yZCBmb3IgbWFzdGVyVXNlciBpbiB0aGUgc2VjcmV0cyBtYW5hZ2VyXG4gICAgY29uc3QgbWFzdGVyVXNlclNlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0RiTWFzdGVyU2VjcmV0Jywge1xuICAgICAgc2VjcmV0TmFtZTogYCR7U3RhY2sub2YodGhpcykuc3RhY2tOYW1lfS1EYk1hc3RlclNlY3JldGAsXG4gICAgICBnZW5lcmF0ZVNlY3JldFN0cmluZzoge1xuICAgICAgICBzZWNyZXRTdHJpbmdUZW1wbGF0ZTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHVzZXJuYW1lOiB0aGlzLm1hc3RlclVzZXIsXG4gICAgICAgIH0pLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogMTIsXG4gICAgICAgIGV4Y2x1ZGVQdW5jdHVhdGlvbjogdHJ1ZSxcbiAgICAgICAgaW5jbHVkZVNwYWNlOiBmYWxzZSxcbiAgICAgICAgZ2VuZXJhdGVTdHJpbmdLZXk6ICdwYXNzd29yZCcsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5tYXN0ZXJQYXNzd29yZCA9IG1hc3RlclVzZXJTZWNyZXQ7XG5cbiAgICBjb25zdCBkYkNvbm5lY3Rpb25Hcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnREIgU2VjdXJpdHkgR3JvdXAnLCB7XG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICB9KTtcbiAgICBkYkNvbm5lY3Rpb25Hcm91cC5jb25uZWN0aW9ucy5hbGxvd0ludGVybmFsbHkoZWMyLlBvcnQudGNwKDMzMDYpKTtcblxuICAgIGNvbnN0IGRiQ2x1c3RlciA9IG5ldyByZHMuRGF0YWJhc2VDbHVzdGVyKHRoaXMsICdEQkNsdXN0ZXInLCB7XG4gICAgICBlbmdpbmU6IHByb3BzLmVuZ2luZSA/PyByZHMuRGF0YWJhc2VDbHVzdGVyRW5naW5lLmF1cm9yYU15c3FsKHtcbiAgICAgICAgdmVyc2lvbjogcmRzLkF1cm9yYU15c3FsRW5naW5lVmVyc2lvbi5WRVJfMl8wOF8xLFxuICAgICAgfSksXG4gICAgICBpbnN0YW5jZVByb3BzOiB7XG4gICAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgICBpbnN0YW5jZVR5cGU6IHByb3BzLmluc3RhbmNlVHlwZSA/PyBuZXcgZWMyLkluc3RhbmNlVHlwZSgndDMubWVkaXVtJyksXG4gICAgICAgIHNlY3VyaXR5R3JvdXBzOiBbZGJDb25uZWN0aW9uR3JvdXBdLFxuICAgICAgICB2cGNTdWJuZXRzOiBwcm9wcy52cGNTdWJuZXRzLFxuICAgICAgfSxcbiAgICAgIGNyZWRlbnRpYWxzOiByZHMuQ3JlZGVudGlhbHMuZnJvbVNlY3JldChtYXN0ZXJVc2VyU2VjcmV0KSxcbiAgICAgIGluc3RhbmNlczogcHJvcHMuaW5zdGFuY2VDYXBhY2l0eSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIFdvcmthcm91bmQgZm9yIGJ1ZyB3aGVyZSBUYXJnZXRHcm91cE5hbWUgaXMgbm90IHNldCBidXQgcmVxdWlyZWRcbiAgICBsZXQgY2ZuRGJJbnN0YW5jZSA9IGRiQ2x1c3Rlci5ub2RlLmNoaWxkcmVuLmZpbmQoKGNoaWxkOiBhbnkpID0+IHtcbiAgICAgIHJldHVybiBjaGlsZCBpbnN0YW5jZW9mIHJkcy5DZm5EQkluc3RhbmNlO1xuICAgIH0pIGFzIHJkcy5DZm5EQkluc3RhbmNlO1xuXG4gICAgLy8gZW5hYmxlIHRoZSBSRFMgcHJveHkgYnkgZGVmYXVsdFxuICAgIGlmIChwcm9wcy5yZHNQcm94eSAhPT0gZmFsc2UpIHtcbiAgICAgIC8vIGNyZWF0ZSBpYW0gcm9sZSBmb3IgUkRTIHByb3h5XG4gICAgICBjb25zdCByZHNQcm94eVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1Jkc1Byb3h5Um9sZScsIHtcbiAgICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ3Jkcy5hbWF6b25hd3MuY29tJyksXG4gICAgICB9KTtcbiAgICAgIC8vIHNlZTogaHR0cHM6Ly9hd3MuYW1hem9uLmNvbS90dy9ibG9ncy9jb21wdXRlL3VzaW5nLWFtYXpvbi1yZHMtcHJveHktd2l0aC1hd3MtbGFtYmRhL1xuICAgICAgcmRzUHJveHlSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdzZWNyZXRzbWFuYWdlcjpHZXRSZXNvdXJjZVBvbGljeScsXG4gICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkdldFNlY3JldFZhbHVlJyxcbiAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6RGVzY3JpYmVTZWNyZXQnLFxuICAgICAgICAgICdzZWNyZXRzbWFuYWdlcjpMaXN0U2VjcmV0VmVyc2lvbklkcycsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW21hc3RlclVzZXJTZWNyZXQuc2VjcmV0QXJuXSxcbiAgICAgIH0pKTtcblxuICAgICAgY29uc3QgcHJveHlPcHRpb25zOiByZHMuRGF0YWJhc2VQcm94eU9wdGlvbnMgPSB7XG4gICAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgICBzZWNyZXRzOiBbbWFzdGVyVXNlclNlY3JldF0sXG4gICAgICAgIGlhbUF1dGg6IHRydWUsXG4gICAgICAgIGRiUHJveHlOYW1lOiBgJHtTdGFjay5vZih0aGlzKS5zdGFja05hbWV9LVJEU1Byb3h5YCxcbiAgICAgICAgc2VjdXJpdHlHcm91cHM6IFtkYkNvbm5lY3Rpb25Hcm91cF0sXG4gICAgICAgIHJvbGU6IHJkc1Byb3h5Um9sZSxcbiAgICAgICAgdnBjU3VibmV0czogcHJvcHMudnBjU3VibmV0cyxcbiAgICAgIH07XG5cbiAgICAgIC8vIGNyZWF0ZSB0aGUgUkRTIHByb3h5XG4gICAgICB0aGlzLnJkc1Byb3h5ID0gZGJDbHVzdGVyLmFkZFByb3h5KCdSRFNQcm94eScsIHByb3h5T3B0aW9ucyk7XG4gICAgICAvLyBlbnN1cmUgREIgaW5zdGFuY2UgaXMgcmVhZHkgYmVmb3JlIGNyZWF0aW5nIHRoZSBwcm94eVxuICAgICAgdGhpcy5yZHNQcm94eT8ubm9kZS5hZGREZXBlbmRlbmN5KGNmbkRiSW5zdGFuY2UpO1xuICAgIH1cbiAgfVxufVxuIl19