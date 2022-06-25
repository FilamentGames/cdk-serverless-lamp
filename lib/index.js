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
        const endpoint = new apigateway.HttpApi(this, 'apiservice', {
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
        new ServerlessApi(this, id, {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFDQSw2QkFBNkI7QUFDN0IsOERBQThEO0FBQzlELHNHQUFxRjtBQUNyRiw2Q0FPcUI7QUFDckIsMkNBQXVDO0FBcUV2Qzs7R0FFRztBQUNILE1BQWEsYUFBYyxTQUFRLHNCQUFTO0lBSTFDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBeUI7UUFDakUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLHlCQUF5QixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLDRCQUE0QixDQUFDLENBQUM7UUFDckYsTUFBTSxzQkFBc0IsR0FBRyxPQUFPLENBQUM7UUFFdkMsSUFBSSxDQUFDLEdBQUcsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDO1FBRXJCLElBQUksQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQU8sSUFBSSxJQUFJLHdCQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUU7WUFDbkUsT0FBTyxFQUFFLHdCQUFNLENBQUMsT0FBTyxDQUFDLFlBQVk7WUFDcEMsT0FBTyxFQUFFLGtCQUFrQjtZQUMzQixNQUFNLEVBQUU7Z0JBQ04sd0JBQU0sQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsZ0JBQWdCLENBQUM7YUFDdEY7WUFDRCxJQUFJLEVBQUUsd0JBQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxjQUFjLElBQUkseUJBQXlCLENBQUM7WUFDL0UsV0FBVyxFQUFFO2dCQUNYLFdBQVcsRUFBRSxNQUFNO2dCQUNuQixTQUFTLEVBQUUsS0FBSyxDQUFDLGNBQWMsRUFBRSxjQUFjLElBQUksRUFBRTtnQkFDckQsU0FBUyxFQUFFLEtBQUssQ0FBQyxjQUFjLEVBQUUs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O2FBQ3pELENBQUMsQ0FBQztZQUNILHVGQUF1RjtZQUN2RixZQUFZLENBQUMsV0FBVyxDQUFDLElBQUkscUJBQUcsQ0FBQyxlQUFlLENBQUM7Z0JBQy9DLE9BQU8sRUFBRTtvQkFDUCxrQ0FBa0M7b0JBQ2xDLCtCQUErQjtvQkFDL0IsK0JBQStCO29CQUMvQixxQ0FBcUM7aUJBQ3RDO2dCQUNELFNBQVMsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsQ0FBQzthQUN4QyxDQUFDLENBQUMsQ0FBQztZQUVKLE1BQU0sWUFBWSxHQUE2QjtnQkFDN0MsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO2dCQUNkLE9BQU8sRUFBRSxDQUFDLGdCQUFnQixDQUFDO2dCQUMzQixPQUFPLEVBQUUsSUFBSTtnQkFDYixXQUFXLEVBQUUsR0FBRyxtQkFBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLFdBQVc7Z0JBQ25ELGNBQWMsRUFBRSxDQUFDLGlCQUFpQixDQUFDO2dCQUNuQyxJQUFJLEVBQUUsWUFBWTtnQkFDbEIsVUFBVSxFQUFFLEtBQUssQ0FBQyxVQUFVO2FBQzdCLENBQUM7WUFFRix1QkFBdUI7WUFDdkIsSUFBSSxDQUFDLFFBQVEsR0FBRyxTQUFTLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxZQUFZLENBQUMsQ0FBQztZQUM3RCx3REFBd0Q7WUFDeEQsSUFBSSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1NBQ2xEO0lBQ0gsQ0FBQzs7QUFuRkgsMENBb0ZDIiwic291cmNlc0NvbnRlbnQiOlsiXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdAYXdzLWNkay9hd3MtYXBpZ2F0ZXdheXYyLWFscGhhJztcbmltcG9ydCB7IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbiB9IGZyb20gJ0Bhd3MtY2RrL2F3cy1hcGlnYXRld2F5djItaW50ZWdyYXRpb25zLWFscGhhJztcbmltcG9ydCB7XG4gIFN0YWNrLCBDZm5PdXRwdXQsIER1cmF0aW9uLCBSZW1vdmFsUG9saWN5LFxuICBhd3NfZWMyIGFzIGVjMixcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIGF3c19sYW1iZGEgYXMgbGFtYmRhLFxuICBhd3NfcmRzIGFzIHJkcyxcbiAgYXdzX3NlY3JldHNtYW5hZ2VyIGFzIHNlY3JldHNtYW5hZ2VyLFxufSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuXG5leHBvcnQgaW50ZXJmYWNlIERhdGFiYXNlQ29uZmlnIHtcbiAgLyoqXG4gICAqIFRoZSBEQiB3cml0ZXIgZW5kcG9pbnRcbiAgICovXG4gIHJlYWRvbmx5IHdyaXRlckVuZHBvaW50OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBEQiByZWFkZXIgZW5kcG9pbnRcbiAgICovXG4gIHJlYWRvbmx5IHJlYWRlckVuZHBvaW50Pzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgREIgbWFzdGVyIHVzZXJuYW1lXG4gICAqL1xuICByZWFkb25seSBtYXN0ZXJVc2VyTmFtZT86IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIERCIG1hc3RlciBwYXNzd29yZCBzZWNyZXRcbiAgICovXG4gIHJlYWRvbmx5IG1hc3RlclVzZXJQYXNzd29yZFNlY3JldD86IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG59XG5cbi8qKlxuICogQ29uc3RydWN0IHByb3BlcnRpZXMgZm9yIGBTZXJ2ZXJsZXNzQXBpYFxuICovXG5leHBvcnQgaW50ZXJmYWNlIFNlcnZlcmxlc3NBcGlQcm9wcyB7XG4gIC8qKlxuICAgKiBjdXN0b20gbGFtYmRhIGZ1bmN0aW9uIGZvciB0aGUgQVBJXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gQSBMYW1iZGEgZnVuY3Rpb24gd2l0aCBMYXZhdmVsIGFuZCBCcmVmIHN1cHBvcnQgd2lsbCBiZSBjcmVhdGVkXG4gICAqL1xuICByZWFkb25seSBoYW5kbGVyPzogbGFtYmRhLklGdW5jdGlvbjtcblxuICAvKipcbiAgICogY3VzdG9tIGxhbWJkYSBjb2RlIGFzc2V0IHBhdGhcbiAgICpcbiAgICogQGRlZmF1bHQgLSBERUZBVUxUX0xBTUJEQV9BU1NFVF9QQVRIXG4gICAqL1xuICByZWFkb25seSBsYW1iZGFDb2RlUGF0aD86IHN0cmluZztcblxuICAvKipcbiAgICogQVdTIExhbWJkYSBsYXllciB2ZXJzaW9uIGZyb20gdGhlIEJyZWYgcnVudGltZS5cbiAgICogZS5nLiBhcm46YXdzOmxhbWJkYTp1cy13ZXN0LTE6MjA5NDk3NDAwNjk4OmxheWVyOnBocC03NC1mcG06MTJcbiAgICogY2hlY2sgdGhlIGxhdGVzdCBydW50aW1lIHZlcmlvbiBhcm4gYXQgaHR0cHM6Ly9icmVmLnNoL2RvY3MvcnVudGltZXMvXG4gICAqL1xuICByZWFkb25seSBicmVmTGF5ZXJWZXJzaW9uOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBWUEMgZm9yIHRoaXMgc3RhY2tcbiAgICovXG4gIHJlYWRvbmx5IHZwYz86IGVjMi5JVnBjO1xuXG4gIC8qKlxuICAgKiBEYXRhYmFzZSBjb25maWd1cmF0aW9uc1xuICAgKi9cbiAgcmVhZG9ubHkgZGF0YWJhc2VDb25maWc/OiBEYXRhYmFzZUNvbmZpZztcblxuICAvKipcbiAgICogUkRTIFByb3h5IGZvciB0aGUgTGFtYmRhIGZ1bmN0aW9uXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gbm8gZGIgcHJveHlcbiAgICovXG4gIHJlYWRvbmx5IHJkc1Byb3h5PzogcmRzLklEYXRhYmFzZVByb3h5O1xuXG59XG5cbi8qKlxuICogVXNlIGBTZXJ2ZXJsZXNzQXBpYCB0byBjcmVhdGUgdGhlIHNlcnZlcmxlc3MgQVBJIHJlc291cmNlXG4gKi9cbmV4cG9ydCBjbGFzcyBTZXJ2ZXJsZXNzQXBpIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcmVhZG9ubHkgaGFuZGxlcjogbGFtYmRhLklGdW5jdGlvbjtcbiAgcmVhZG9ubHkgdnBjPzogZWMyLklWcGM7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFNlcnZlcmxlc3NBcGlQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCBERUZBVUxUX0xBTUJEQV9BU1NFVF9QQVRIID0gcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2NvbXBvc2VyL2xhcmF2ZWw1OC1icmVmJyk7XG4gICAgY29uc3QgREVGQVVMVF9EQl9NQVNURVJfVVNFUiA9ICdhZG1pbic7XG5cbiAgICB0aGlzLnZwYyA9IHByb3BzLnZwYztcblxuICAgIHRoaXMuaGFuZGxlciA9IHByb3BzLmhhbmRsZXIgPz8gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnaGFuZGxlcicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBST1ZJREVEX0FMMixcbiAgICAgIGhhbmRsZXI6ICdwdWJsaWMvaW5kZXgucGhwJyxcbiAgICAgIGxheWVyczogW1xuICAgICAgICBsYW1iZGEuTGF5ZXJWZXJzaW9uLmZyb21MYXllclZlcnNpb25Bcm4odGhpcywgJ0JyZWZQSFBMYXllcicsIHByb3BzLmJyZWZMYXllclZlcnNpb24pLFxuICAgICAgXSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwcm9wcz8ubGFtYmRhQ29kZVBhdGggPz8gREVGQVVMVF9MQU1CREFfQVNTRVRfUEFUSCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBBUFBfU1RPUkFHRTogJy90bXAnLFxuICAgICAgICBEQl9XUklURVI6IHByb3BzLmRhdGFiYXNlQ29uZmlnPy53cml0ZXJFbmRwb2ludCA/PyAnJyxcbiAgICAgICAgREJfUkVBREVSOiBwcm9wcy5kYXRhYmFzZUNvbmZpZz8ucmVhZGVyRW5kcG9pbnQgPz8gcHJvcHMuZGF0YWJhc2VDb25maWc/LndyaXRlckVuZHBvaW50ID8/ICcnLFxuICAgICAgICBEQl9VU0VSOiBwcm9wcy5kYXRhYmFzZUNvbmZpZz8ubWFzdGVyVXNlck5hbWUgPz8gREVGQVVMVF9EQl9NQVNURVJfVVNFUixcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDEyMCksXG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICB9KTtcblxuICAgIC8vIGFsbG93IGxhbWJkYSBleGVjdXRpb24gcm9sZSB0byBjb25uZWN0IHRvIFJEUyBwcm94eVxuICAgIGlmIChwcm9wcy5yZHNQcm94eSkge1xuICAgICAgdGhpcy5oYW5kbGVyLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFsncmRzLWRiOmNvbm5lY3QnXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbcHJvcHMucmRzUHJveHkuZGJQcm94eUFybl0sXG4gICAgICB9KSk7XG4gICAgfVxuXG4gICAgY29uc3QgZW5kcG9pbnQgPSBuZXcgYXBpZ2F0ZXdheS5IdHRwQXBpKHRoaXMsICdhcGlzZXJ2aWNlJywge1xuICAgICAgZGVmYXVsdEludGVncmF0aW9uOiBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdsYW1iZGFIYW5kbGVyJywgdGhpcy5oYW5kbGVyKSxcbiAgICB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdFbmRwb2ludFVSTCcsIHsgdmFsdWU6IGVuZHBvaW50LnVybCEgfSk7XG4gIH1cbn1cblxuLyoqXG4gKiBDb25zdHJ1Y3QgcHJvcGVydGllcyBmb3IgYFNlcnZlcmxlc3NMYXJhdmVsYFxuICovXG5leHBvcnQgaW50ZXJmYWNlIFNlcnZlcmxlc3NMYXJhdmVsUHJvcHMgZXh0ZW5kcyBTZXJ2ZXJsZXNzQXBpUHJvcHMge1xuICAvKipcbiAgICogcGF0aCB0byB5b3VyIGxvY2FsIGxhcmF2ZWwgZGlyZWN0b3J5IHdpdGggYnJlZlxuICAgKi9cbiAgcmVhZG9ubHkgbGFyYXZlbFBhdGg6IHN0cmluZztcblxufVxuXG4vKipcbiAqIFVzZSBgU2VydmVybGVzc0xhcmF2ZWxgIHRvIGNyZWF0ZSB0aGUgc2VydmVybGVzcyBMYXJhdmVsIHJlc291cmNlXG4gKi9cbmV4cG9ydCBjbGFzcyBTZXJ2ZXJsZXNzTGFyYXZlbCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTZXJ2ZXJsZXNzTGFyYXZlbFByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcbiAgICBuZXcgU2VydmVybGVzc0FwaSh0aGlzLCBpZCwge1xuICAgICAgbGFtYmRhQ29kZVBhdGg6IHByb3BzLmxhcmF2ZWxQYXRoLFxuICAgICAgYnJlZkxheWVyVmVyc2lvbjogcHJvcHMuYnJlZkxheWVyVmVyc2lvbixcbiAgICAgIGhhbmRsZXI6IHByb3BzLmhhbmRsZXIsXG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgIGRhdGFiYXNlQ29uZmlnOiBwcm9wcy5kYXRhYmFzZUNvbmZpZyxcbiAgICAgIHJkc1Byb3h5OiBwcm9wcy5yZHNQcm94eSxcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIERhdGFiYXNlUHJvcHMge1xuICAvKipcbiAgICogZGF0YWJhc2UgY2x1c3RlciBlbmdpbmVcbiAgICpcbiAgICogQGRlZmF1bHQgQVVST1JBX01ZU1FMXG4gICAqL1xuICByZWFkb25seSBlbmdpbmU/OiByZHMuSUNsdXN0ZXJFbmdpbmU7XG5cbiAgLyoqXG4gICAqIG1hc3RlciB1c2VybmFtZVxuICAgKlxuICAgKiBAZGVmYXVsdCBhZG1pblxuICAgKi9cbiAgcmVhZG9ubHkgbWFzdGVyVXNlck5hbWU/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBWUEMgZm9yIHRoZSBEYXRhYmFzZUNsdXN0ZXJcbiAgICovXG4gIHJlYWRvbmx5IHZwYzogZWMyLklWcGM7XG5cbiAgLyoqXG4gICAqIGluc3RhbmNlIHR5cGUgb2YgdGhlIGNsdXN0ZXJcbiAgICpcbiAgICogQGRlZmF1bHQgLSB0My5tZWRpdW0gKG9yLCBtb3JlIHByZWNpc2VseSwgZGIudDMubWVkaXVtKVxuICAgKi9cbiAgcmVhZG9ubHkgaW5zdGFuY2VUeXBlPzogZWMyLkluc3RhbmNlVHlwZTtcblxuICAvKipcbiAgICogZW5hYmxlIHRoZSBBbWF6b24gUkRTIHByb3h5XG4gICAqXG4gICAqIEBkZWZhdWx0IHRydWVcbiAgICovXG4gIHJlYWRvbmx5IHJkc1Byb3h5PzogYm9vbGVhbjtcblxuICAvKipcbiAgICogUkRTIFByb3h5IE9wdGlvbnNcbiAgICovXG4gIHJlYWRvbmx5IHJkc1Byb3h5T3B0aW9ucz86IHJkcy5EYXRhYmFzZVByb3h5T3B0aW9ucztcblxuICAvKipcbiAgICogSG93IG1hbnkgcmVwbGljYXMvaW5zdGFuY2VzIHRvIGNyZWF0ZS4gSGFzIHRvIGJlIGF0IGxlYXN0IDEuXG4gICAqXG4gICAqIEBkZWZhdWx0IDFcbiAgICovXG4gIHJlYWRvbmx5IGluc3RhbmNlQ2FwYWNpdHk/OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIExpc3Qgb2Ygc3VibmV0cyB0byB1c2Ugd2hlbiBjcmVhdGluZyBzdWJuZXQgZ3JvdXAuXG4gICAqL1xuICByZWFkb25seSB2cGNTdWJuZXRzPzogZWMyLlN1Ym5ldFNlbGVjdGlvbjtcblxufVxuXG5leHBvcnQgY2xhc3MgRGF0YWJhc2VDbHVzdGVyIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcmVhZG9ubHkgcmRzUHJveHk/OiByZHMuRGF0YWJhc2VQcm94eTtcbiAgcmVhZG9ubHkgbWFzdGVyVXNlcjogc3RyaW5nO1xuICByZWFkb25seSBtYXN0ZXJQYXNzd29yZDogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogRGF0YWJhc2VQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICB0aGlzLm1hc3RlclVzZXIgPSBwcm9wcy5tYXN0ZXJVc2VyTmFtZSA/PyAnYWRtaW4nO1xuXG4gICAgLy8gZ2VuZXJhdGUgYW5kIHN0b3JlIHBhc3N3b3JkIGZvciBtYXN0ZXJVc2VyIGluIHRoZSBzZWNyZXRzIG1hbmFnZXJcbiAgICBjb25zdCBtYXN0ZXJVc2VyU2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnRGJNYXN0ZXJTZWNyZXQnLCB7XG4gICAgICBzZWNyZXROYW1lOiBgJHtTdGFjay5vZih0aGlzKS5zdGFja05hbWV9LURiTWFzdGVyU2VjcmV0YCxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgdXNlcm5hbWU6IHRoaXMubWFzdGVyVXNlcixcbiAgICAgICAgfSksXG4gICAgICAgIHBhc3N3b3JkTGVuZ3RoOiAxMixcbiAgICAgICAgZXhjbHVkZVB1bmN0dWF0aW9uOiB0cnVlLFxuICAgICAgICBpbmNsdWRlU3BhY2U6IGZhbHNlLFxuICAgICAgICBnZW5lcmF0ZVN0cmluZ0tleTogJ3Bhc3N3b3JkJyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLm1hc3RlclBhc3N3b3JkID0gbWFzdGVyVXNlclNlY3JldDtcblxuICAgIGNvbnN0IGRiQ29ubmVjdGlvbkdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdEQiBTZWN1cml0eSBHcm91cCcsIHtcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgIH0pO1xuICAgIGRiQ29ubmVjdGlvbkdyb3VwLmNvbm5lY3Rpb25zLmFsbG93SW50ZXJuYWxseShlYzIuUG9ydC50Y3AoMzMwNikpO1xuXG4gICAgY29uc3QgZGJDbHVzdGVyID0gbmV3IHJkcy5EYXRhYmFzZUNsdXN0ZXIodGhpcywgJ0RCQ2x1c3RlcicsIHtcbiAgICAgIGVuZ2luZTogcHJvcHMuZW5naW5lID8/IHJkcy5EYXRhYmFzZUNsdXN0ZXJFbmdpbmUuYXVyb3JhTXlzcWwoe1xuICAgICAgICB2ZXJzaW9uOiByZHMuQXVyb3JhTXlzcWxFbmdpbmVWZXJzaW9uLlZFUl8yXzA4XzEsXG4gICAgICB9KSxcbiAgICAgIGluc3RhbmNlUHJvcHM6IHtcbiAgICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICAgIGluc3RhbmNlVHlwZTogcHJvcHMuaW5zdGFuY2VUeXBlID8/IG5ldyBlYzIuSW5zdGFuY2VUeXBlKCd0My5tZWRpdW0nKSxcbiAgICAgICAgc2VjdXJpdHlHcm91cHM6IFtkYkNvbm5lY3Rpb25Hcm91cF0sXG4gICAgICAgIHZwY1N1Ym5ldHM6IHByb3BzLnZwY1N1Ym5ldHMsXG4gICAgICB9LFxuICAgICAgY3JlZGVudGlhbHM6IHJkcy5DcmVkZW50aWFscy5mcm9tU2VjcmV0KG1hc3RlclVzZXJTZWNyZXQpLFxuICAgICAgaW5zdGFuY2VzOiBwcm9wcy5pbnN0YW5jZUNhcGFjaXR5LFxuICAgICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gV29ya2Fyb3VuZCBmb3IgYnVnIHdoZXJlIFRhcmdldEdyb3VwTmFtZSBpcyBub3Qgc2V0IGJ1dCByZXF1aXJlZFxuICAgIGxldCBjZm5EYkluc3RhbmNlID0gZGJDbHVzdGVyLm5vZGUuY2hpbGRyZW4uZmluZCgoY2hpbGQ6IGFueSkgPT4ge1xuICAgICAgcmV0dXJuIGNoaWxkIGluc3RhbmNlb2YgcmRzLkNmbkRCSW5zdGFuY2U7XG4gICAgfSkgYXMgcmRzLkNmbkRCSW5zdGFuY2U7XG5cbiAgICAvLyBlbmFibGUgdGhlIFJEUyBwcm94eSBieSBkZWZhdWx0XG4gICAgaWYgKHByb3BzLnJkc1Byb3h5ICE9PSBmYWxzZSkge1xuICAgICAgLy8gY3JlYXRlIGlhbSByb2xlIGZvciBSRFMgcHJveHlcbiAgICAgIGNvbnN0IHJkc1Byb3h5Um9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnUmRzUHJveHlSb2xlJywge1xuICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgncmRzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIH0pO1xuICAgICAgLy8gc2VlOiBodHRwczovL2F3cy5hbWF6b24uY29tL3R3L2Jsb2dzL2NvbXB1dGUvdXNpbmctYW1hem9uLXJkcy1wcm94eS13aXRoLWF3cy1sYW1iZGEvXG4gICAgICByZHNQcm94eVJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkdldFJlc291cmNlUG9saWN5JyxcbiAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6R2V0U2VjcmV0VmFsdWUnLFxuICAgICAgICAgICdzZWNyZXRzbWFuYWdlcjpEZXNjcmliZVNlY3JldCcsXG4gICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkxpc3RTZWNyZXRWZXJzaW9uSWRzJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbbWFzdGVyVXNlclNlY3JldC5zZWNyZXRBcm5dLFxuICAgICAgfSkpO1xuXG4gICAgICBjb25zdCBwcm94eU9wdGlvbnM6IHJkcy5EYXRhYmFzZVByb3h5T3B0aW9ucyA9IHtcbiAgICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICAgIHNlY3JldHM6IFttYXN0ZXJVc2VyU2VjcmV0XSxcbiAgICAgICAgaWFtQXV0aDogdHJ1ZSxcbiAgICAgICAgZGJQcm94eU5hbWU6IGAke1N0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0tUkRTUHJveHlgLFxuICAgICAgICBzZWN1cml0eUdyb3VwczogW2RiQ29ubmVjdGlvbkdyb3VwXSxcbiAgICAgICAgcm9sZTogcmRzUHJveHlSb2xlLFxuICAgICAgICB2cGNTdWJuZXRzOiBwcm9wcy52cGNTdWJuZXRzLFxuICAgICAgfTtcblxuICAgICAgLy8gY3JlYXRlIHRoZSBSRFMgcHJveHlcbiAgICAgIHRoaXMucmRzUHJveHkgPSBkYkNsdXN0ZXIuYWRkUHJveHkoJ1JEU1Byb3h5JywgcHJveHlPcHRpb25zKTtcbiAgICAgIC8vIGVuc3VyZSBEQiBpbnN0YW5jZSBpcyByZWFkeSBiZWZvcmUgY3JlYXRpbmcgdGhlIHByb3h5XG4gICAgICB0aGlzLnJkc1Byb3h5Py5ub2RlLmFkZERlcGVuZGVuY3koY2ZuRGJJbnN0YW5jZSk7XG4gICAgfVxuICB9XG59XG4iXX0=