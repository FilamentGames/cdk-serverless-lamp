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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFDQSw2QkFBNkI7QUFDN0IsOERBQThEO0FBQzlELHNHQUFxRjtBQUNyRiw2Q0FPcUI7QUFDckIsMkNBQXVDO0FBcUV2Qzs7R0FFRztBQUNILE1BQWEsYUFBYyxTQUFRLHNCQUFTO0lBSzFDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBeUI7UUFDakUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLHlCQUF5QixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLDRCQUE0QixDQUFDLENBQUM7UUFDckYsTUFBTSxzQkFBc0IsR0FBRyxPQUFPLENBQUM7UUFFdkMsSUFBSSxDQUFDLEdBQUcsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDO1FBRXJCLElBQUksQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQU8sSUFBSSxJQUFJLHdCQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUU7WUFDbkUsT0FBTyxFQUFFLHdCQUFNLENBQUMsT0FBTyxDQUFDLFlBQVk7WUFDcEMsT0FBTyxFQUFFLGtCQUFrQjtZQUMzQixNQUFNLEVBQUU7Z0JBQ04sd0JBQU0sQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsZ0JBQWdCLENBQUM7YUFDdEY7WUFDRCxJQUFJLEVBQUUsd0JBQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxjQUFjLElBQUkseUJBQXlCLENBQUM7WUFDL0UsV0FBVyxFQUFFO2dCQUNYLFdBQVcsRUFBRSxNQUFNO2dCQUNuQixTQUFTLEVBQUUsS0FBSyxDQUFDLGNBQWMsRUFBRSxjQUFjLElBQUksRUFBRTtnQkFDckQsU0FBUyxFQUFFLEtBQUssQ0FBQyxjQUFjLEVBQUUs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LElBQUkscUJBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxtQkFBbUIsQ0FBQzthQUN6RCxDQUFDLENBQUM7WUFDSCx1RkFBdUY7WUFDdkYsWUFBWSxDQUFDLFdBQVcsQ0FBQyxJQUFJLHFCQUFHLENBQUMsZUFBZSxDQUFDO2dCQUMvQyxPQUFPLEVBQUU7b0JBQ1Asa0NBQWtDO29CQUNsQywrQkFBK0I7b0JBQy9CLCtCQUErQjtvQkFDL0IscUNBQXFDO2lCQUN0QztnQkFDRCxTQUFTLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUM7YUFDeEMsQ0FBQyxDQUFDLENBQUM7WUFFSixNQUFNLFlBQVksR0FBNkI7Z0JBQzdDLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRztnQkFDZCxPQUFPLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQztnQkFDM0IsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsV0FBVyxFQUFFLEdBQUcsbUJBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsU0FBUyxXQUFXO2dCQUNuRCxjQUFjLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQztnQkFDbkMsSUFBSSxFQUFFLFlBQVk7Z0JBQ2xCLFVBQVUsRUFBRSxLQUFLLENBQUMsVUFBVTthQUM3QixDQUFDO1lBRUYsdUJBQXVCO1lBQ3ZCLElBQUksQ0FBQyxRQUFRLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsWUFBWSxDQUFDLENBQUM7WUFDN0Qsd0RBQXdEO1lBQ3hELElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQztTQUNsRDtJQUNILENBQUM7O0FBbkZILDBDQW9GQyIsInNvdXJjZXNDb250ZW50IjpbIlxuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXl2Mi1hbHBoYSc7XG5pbXBvcnQgeyBIdHRwTGFtYmRhSW50ZWdyYXRpb24gfSBmcm9tICdAYXdzLWNkay9hd3MtYXBpZ2F0ZXdheXYyLWludGVncmF0aW9ucy1hbHBoYSc7XG5pbXBvcnQge1xuICBTdGFjaywgQ2ZuT3V0cHV0LCBEdXJhdGlvbiwgUmVtb3ZhbFBvbGljeSxcbiAgYXdzX2VjMiBhcyBlYzIsXG4gIGF3c19pYW0gYXMgaWFtLFxuICBhd3NfbGFtYmRhIGFzIGxhbWJkYSxcbiAgYXdzX3JkcyBhcyByZHMsXG4gIGF3c19zZWNyZXRzbWFuYWdlciBhcyBzZWNyZXRzbWFuYWdlcixcbn0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cblxuZXhwb3J0IGludGVyZmFjZSBEYXRhYmFzZUNvbmZpZyB7XG4gIC8qKlxuICAgKiBUaGUgREIgd3JpdGVyIGVuZHBvaW50XG4gICAqL1xuICByZWFkb25seSB3cml0ZXJFbmRwb2ludDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgREIgcmVhZGVyIGVuZHBvaW50XG4gICAqL1xuICByZWFkb25seSByZWFkZXJFbmRwb2ludD86IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIERCIG1hc3RlciB1c2VybmFtZVxuICAgKi9cbiAgcmVhZG9ubHkgbWFzdGVyVXNlck5hbWU/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBEQiBtYXN0ZXIgcGFzc3dvcmQgc2VjcmV0XG4gICAqL1xuICByZWFkb25seSBtYXN0ZXJVc2VyUGFzc3dvcmRTZWNyZXQ/OiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xufVxuXG4vKipcbiAqIENvbnN0cnVjdCBwcm9wZXJ0aWVzIGZvciBgU2VydmVybGVzc0FwaWBcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTZXJ2ZXJsZXNzQXBpUHJvcHMge1xuICAvKipcbiAgICogY3VzdG9tIGxhbWJkYSBmdW5jdGlvbiBmb3IgdGhlIEFQSVxuICAgKlxuICAgKiBAZGVmYXVsdCAtIEEgTGFtYmRhIGZ1bmN0aW9uIHdpdGggTGF2YXZlbCBhbmQgQnJlZiBzdXBwb3J0IHdpbGwgYmUgY3JlYXRlZFxuICAgKi9cbiAgcmVhZG9ubHkgaGFuZGxlcj86IGxhbWJkYS5JRnVuY3Rpb247XG5cbiAgLyoqXG4gICAqIGN1c3RvbSBsYW1iZGEgY29kZSBhc3NldCBwYXRoXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gREVGQVVMVF9MQU1CREFfQVNTRVRfUEFUSFxuICAgKi9cbiAgcmVhZG9ubHkgbGFtYmRhQ29kZVBhdGg/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEFXUyBMYW1iZGEgbGF5ZXIgdmVyc2lvbiBmcm9tIHRoZSBCcmVmIHJ1bnRpbWUuXG4gICAqIGUuZy4gYXJuOmF3czpsYW1iZGE6dXMtd2VzdC0xOjIwOTQ5NzQwMDY5ODpsYXllcjpwaHAtNzQtZnBtOjEyXG4gICAqIGNoZWNrIHRoZSBsYXRlc3QgcnVudGltZSB2ZXJpb24gYXJuIGF0IGh0dHBzOi8vYnJlZi5zaC9kb2NzL3J1bnRpbWVzL1xuICAgKi9cbiAgcmVhZG9ubHkgYnJlZkxheWVyVmVyc2lvbjogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgVlBDIGZvciB0aGlzIHN0YWNrXG4gICAqL1xuICByZWFkb25seSB2cGM/OiBlYzIuSVZwYztcblxuICAvKipcbiAgICogRGF0YWJhc2UgY29uZmlndXJhdGlvbnNcbiAgICovXG4gIHJlYWRvbmx5IGRhdGFiYXNlQ29uZmlnPzogRGF0YWJhc2VDb25maWc7XG5cbiAgLyoqXG4gICAqIFJEUyBQcm94eSBmb3IgdGhlIExhbWJkYSBmdW5jdGlvblxuICAgKlxuICAgKiBAZGVmYXVsdCAtIG5vIGRiIHByb3h5XG4gICAqL1xuICByZWFkb25seSByZHNQcm94eT86IHJkcy5JRGF0YWJhc2VQcm94eTtcblxufVxuXG4vKipcbiAqIFVzZSBgU2VydmVybGVzc0FwaWAgdG8gY3JlYXRlIHRoZSBzZXJ2ZXJsZXNzIEFQSSByZXNvdXJjZVxuICovXG5leHBvcnQgY2xhc3MgU2VydmVybGVzc0FwaSBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHJlYWRvbmx5IGhhbmRsZXI6IGxhbWJkYS5JRnVuY3Rpb247XG4gIHJlYWRvbmx5IHZwYz86IGVjMi5JVnBjO1xuICByZWFkb25seSBlbmRwb2ludD86IGFwaWdhdGV3YXkuSHR0cEFwaTtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU2VydmVybGVzc0FwaVByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IERFRkFVTFRfTEFNQkRBX0FTU0VUX1BBVEggPSBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vY29tcG9zZXIvbGFyYXZlbDU4LWJyZWYnKTtcbiAgICBjb25zdCBERUZBVUxUX0RCX01BU1RFUl9VU0VSID0gJ2FkbWluJztcblxuICAgIHRoaXMudnBjID0gcHJvcHMudnBjO1xuXG4gICAgdGhpcy5oYW5kbGVyID0gcHJvcHMuaGFuZGxlciA/PyBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdoYW5kbGVyJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFJPVklERURfQUwyLFxuICAgICAgaGFuZGxlcjogJ3B1YmxpYy9pbmRleC5waHAnLFxuICAgICAgbGF5ZXJzOiBbXG4gICAgICAgIGxhbWJkYS5MYXllclZlcnNpb24uZnJvbUxheWVyVmVyc2lvbkFybih0aGlzLCAnQnJlZlBIUExheWVyJywgcHJvcHMuYnJlZkxheWVyVmVyc2lvbiksXG4gICAgICBdLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHByb3BzPy5sYW1iZGFDb2RlUGF0aCA/PyBERUZBVUxUX0xBTUJEQV9BU1NFVF9QQVRIKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEFQUF9TVE9SQUdFOiAnL3RtcCcsXG4gICAgICAgIERCX1dSSVRFUjogcHJvcHMuZGF0YWJhc2VDb25maWc/LndyaXRlckVuZHBvaW50ID8/ICcnLFxuICAgICAgICBEQl9SRUFERVI6IHByb3BzLmRhdGFiYXNlQ29uZmlnPy5yZWFkZXJFbmRwb2ludCA/PyBwcm9wcy5kYXRhYmFzZUNvbmZpZz8ud3JpdGVyRW5kcG9pbnQgPz8gJycsXG4gICAgICAgIERCX1VTRVI6IHByb3BzLmRhdGFiYXNlQ29uZmlnPy5tYXN0ZXJVc2VyTmFtZSA/PyBERUZBVUxUX0RCX01BU1RFUl9VU0VSLFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMTIwKSxcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgIH0pO1xuXG4gICAgLy8gYWxsb3cgbGFtYmRhIGV4ZWN1dGlvbiByb2xlIHRvIGNvbm5lY3QgdG8gUkRTIHByb3h5XG4gICAgaWYgKHByb3BzLnJkc1Byb3h5KSB7XG4gICAgICB0aGlzLmhhbmRsZXIuYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogWydyZHMtZGI6Y29ubmVjdCddLFxuICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy5yZHNQcm94eS5kYlByb3h5QXJuXSxcbiAgICAgIH0pKTtcbiAgICB9XG5cbiAgICBjb25zdCBlbmRwb2ludCA9IHRoaXMuZW5kcG9pbnQgPSBuZXcgYXBpZ2F0ZXdheS5IdHRwQXBpKHRoaXMsICdhcGlzZXJ2aWNlJywge1xuICAgICAgZGVmYXVsdEludGVncmF0aW9uOiBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdsYW1iZGFIYW5kbGVyJywgdGhpcy5oYW5kbGVyKSxcbiAgICB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdFbmRwb2ludFVSTCcsIHsgdmFsdWU6IGVuZHBvaW50LnVybCEgfSk7XG4gIH1cbn1cblxuLyoqXG4gKiBDb25zdHJ1Y3QgcHJvcGVydGllcyBmb3IgYFNlcnZlcmxlc3NMYXJhdmVsYFxuICovXG5leHBvcnQgaW50ZXJmYWNlIFNlcnZlcmxlc3NMYXJhdmVsUHJvcHMgZXh0ZW5kcyBTZXJ2ZXJsZXNzQXBpUHJvcHMge1xuICAvKipcbiAgICogcGF0aCB0byB5b3VyIGxvY2FsIGxhcmF2ZWwgZGlyZWN0b3J5IHdpdGggYnJlZlxuICAgKi9cbiAgcmVhZG9ubHkgbGFyYXZlbFBhdGg6IHN0cmluZztcblxufVxuXG4vKipcbiAqIFVzZSBgU2VydmVybGVzc0xhcmF2ZWxgIHRvIGNyZWF0ZSB0aGUgc2VydmVybGVzcyBMYXJhdmVsIHJlc291cmNlXG4gKi9cbmV4cG9ydCBjbGFzcyBTZXJ2ZXJsZXNzTGFyYXZlbCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHJlYWRvbmx5IGFwaT86U2VydmVybGVzc0FwaTtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU2VydmVybGVzc0xhcmF2ZWxQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG4gICAgdGhpcy5hcGkgPSBuZXcgU2VydmVybGVzc0FwaSh0aGlzLCBpZCwge1xuICAgICAgbGFtYmRhQ29kZVBhdGg6IHByb3BzLmxhcmF2ZWxQYXRoLFxuICAgICAgYnJlZkxheWVyVmVyc2lvbjogcHJvcHMuYnJlZkxheWVyVmVyc2lvbixcbiAgICAgIGhhbmRsZXI6IHByb3BzLmhhbmRsZXIsXG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgIGRhdGFiYXNlQ29uZmlnOiBwcm9wcy5kYXRhYmFzZUNvbmZpZyxcbiAgICAgIHJkc1Byb3h5OiBwcm9wcy5yZHNQcm94eSxcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIERhdGFiYXNlUHJvcHMge1xuICAvKipcbiAgICogZGF0YWJhc2UgY2x1c3RlciBlbmdpbmVcbiAgICpcbiAgICogQGRlZmF1bHQgQVVST1JBX01ZU1FMXG4gICAqL1xuICByZWFkb25seSBlbmdpbmU/OiByZHMuSUNsdXN0ZXJFbmdpbmU7XG5cbiAgLyoqXG4gICAqIG1hc3RlciB1c2VybmFtZVxuICAgKlxuICAgKiBAZGVmYXVsdCBhZG1pblxuICAgKi9cbiAgcmVhZG9ubHkgbWFzdGVyVXNlck5hbWU/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBWUEMgZm9yIHRoZSBEYXRhYmFzZUNsdXN0ZXJcbiAgICovXG4gIHJlYWRvbmx5IHZwYzogZWMyLklWcGM7XG5cbiAgLyoqXG4gICAqIGluc3RhbmNlIHR5cGUgb2YgdGhlIGNsdXN0ZXJcbiAgICpcbiAgICogQGRlZmF1bHQgLSB0My5tZWRpdW0gKG9yLCBtb3JlIHByZWNpc2VseSwgZGIudDMubWVkaXVtKVxuICAgKi9cbiAgcmVhZG9ubHkgaW5zdGFuY2VUeXBlPzogZWMyLkluc3RhbmNlVHlwZTtcblxuICAvKipcbiAgICogZW5hYmxlIHRoZSBBbWF6b24gUkRTIHByb3h5XG4gICAqXG4gICAqIEBkZWZhdWx0IHRydWVcbiAgICovXG4gIHJlYWRvbmx5IHJkc1Byb3h5PzogYm9vbGVhbjtcblxuICAvKipcbiAgICogUkRTIFByb3h5IE9wdGlvbnNcbiAgICovXG4gIHJlYWRvbmx5IHJkc1Byb3h5T3B0aW9ucz86IHJkcy5EYXRhYmFzZVByb3h5T3B0aW9ucztcblxuICAvKipcbiAgICogSG93IG1hbnkgcmVwbGljYXMvaW5zdGFuY2VzIHRvIGNyZWF0ZS4gSGFzIHRvIGJlIGF0IGxlYXN0IDEuXG4gICAqXG4gICAqIEBkZWZhdWx0IDFcbiAgICovXG4gIHJlYWRvbmx5IGluc3RhbmNlQ2FwYWNpdHk/OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIExpc3Qgb2Ygc3VibmV0cyB0byB1c2Ugd2hlbiBjcmVhdGluZyBzdWJuZXQgZ3JvdXAuXG4gICAqL1xuICByZWFkb25seSB2cGNTdWJuZXRzPzogZWMyLlN1Ym5ldFNlbGVjdGlvbjtcblxufVxuXG5leHBvcnQgY2xhc3MgRGF0YWJhc2VDbHVzdGVyIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcmVhZG9ubHkgcmRzUHJveHk/OiByZHMuRGF0YWJhc2VQcm94eTtcbiAgcmVhZG9ubHkgbWFzdGVyVXNlcjogc3RyaW5nO1xuICByZWFkb25seSBtYXN0ZXJQYXNzd29yZDogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogRGF0YWJhc2VQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICB0aGlzLm1hc3RlclVzZXIgPSBwcm9wcy5tYXN0ZXJVc2VyTmFtZSA/PyAnYWRtaW4nO1xuXG4gICAgLy8gZ2VuZXJhdGUgYW5kIHN0b3JlIHBhc3N3b3JkIGZvciBtYXN0ZXJVc2VyIGluIHRoZSBzZWNyZXRzIG1hbmFnZXJcbiAgICBjb25zdCBtYXN0ZXJVc2VyU2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnRGJNYXN0ZXJTZWNyZXQnLCB7XG4gICAgICBzZWNyZXROYW1lOiBgJHtTdGFjay5vZih0aGlzKS5zdGFja05hbWV9LURiTWFzdGVyU2VjcmV0YCxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgdXNlcm5hbWU6IHRoaXMubWFzdGVyVXNlcixcbiAgICAgICAgfSksXG4gICAgICAgIHBhc3N3b3JkTGVuZ3RoOiAxMixcbiAgICAgICAgZXhjbHVkZVB1bmN0dWF0aW9uOiB0cnVlLFxuICAgICAgICBpbmNsdWRlU3BhY2U6IGZhbHNlLFxuICAgICAgICBnZW5lcmF0ZVN0cmluZ0tleTogJ3Bhc3N3b3JkJyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLm1hc3RlclBhc3N3b3JkID0gbWFzdGVyVXNlclNlY3JldDtcblxuICAgIGNvbnN0IGRiQ29ubmVjdGlvbkdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdEQiBTZWN1cml0eSBHcm91cCcsIHtcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgIH0pO1xuICAgIGRiQ29ubmVjdGlvbkdyb3VwLmNvbm5lY3Rpb25zLmFsbG93SW50ZXJuYWxseShlYzIuUG9ydC50Y3AoMzMwNikpO1xuXG4gICAgY29uc3QgZGJDbHVzdGVyID0gbmV3IHJkcy5EYXRhYmFzZUNsdXN0ZXIodGhpcywgJ0RCQ2x1c3RlcicsIHtcbiAgICAgIGVuZ2luZTogcHJvcHMuZW5naW5lID8/IHJkcy5EYXRhYmFzZUNsdXN0ZXJFbmdpbmUuYXVyb3JhTXlzcWwoe1xuICAgICAgICB2ZXJzaW9uOiByZHMuQXVyb3JhTXlzcWxFbmdpbmVWZXJzaW9uLlZFUl8yXzA4XzEsXG4gICAgICB9KSxcbiAgICAgIGluc3RhbmNlUHJvcHM6IHtcbiAgICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICAgIGluc3RhbmNlVHlwZTogcHJvcHMuaW5zdGFuY2VUeXBlID8/IG5ldyBlYzIuSW5zdGFuY2VUeXBlKCd0My5tZWRpdW0nKSxcbiAgICAgICAgc2VjdXJpdHlHcm91cHM6IFtkYkNvbm5lY3Rpb25Hcm91cF0sXG4gICAgICAgIHZwY1N1Ym5ldHM6IHByb3BzLnZwY1N1Ym5ldHMsXG4gICAgICB9LFxuICAgICAgY3JlZGVudGlhbHM6IHJkcy5DcmVkZW50aWFscy5mcm9tU2VjcmV0KG1hc3RlclVzZXJTZWNyZXQpLFxuICAgICAgaW5zdGFuY2VzOiBwcm9wcy5pbnN0YW5jZUNhcGFjaXR5LFxuICAgICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gV29ya2Fyb3VuZCBmb3IgYnVnIHdoZXJlIFRhcmdldEdyb3VwTmFtZSBpcyBub3Qgc2V0IGJ1dCByZXF1aXJlZFxuICAgIGxldCBjZm5EYkluc3RhbmNlID0gZGJDbHVzdGVyLm5vZGUuY2hpbGRyZW4uZmluZCgoY2hpbGQ6IGFueSkgPT4ge1xuICAgICAgcmV0dXJuIGNoaWxkIGluc3RhbmNlb2YgcmRzLkNmbkRCSW5zdGFuY2U7XG4gICAgfSkgYXMgcmRzLkNmbkRCSW5zdGFuY2U7XG5cbiAgICAvLyBlbmFibGUgdGhlIFJEUyBwcm94eSBieSBkZWZhdWx0XG4gICAgaWYgKHByb3BzLnJkc1Byb3h5ICE9PSBmYWxzZSkge1xuICAgICAgLy8gY3JlYXRlIGlhbSByb2xlIGZvciBSRFMgcHJveHlcbiAgICAgIGNvbnN0IHJkc1Byb3h5Um9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnUmRzUHJveHlSb2xlJywge1xuICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgncmRzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIH0pO1xuICAgICAgLy8gc2VlOiBodHRwczovL2F3cy5hbWF6b24uY29tL3R3L2Jsb2dzL2NvbXB1dGUvdXNpbmctYW1hem9uLXJkcy1wcm94eS13aXRoLWF3cy1sYW1iZGEvXG4gICAgICByZHNQcm94eVJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkdldFJlc291cmNlUG9saWN5JyxcbiAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6R2V0U2VjcmV0VmFsdWUnLFxuICAgICAgICAgICdzZWNyZXRzbWFuYWdlcjpEZXNjcmliZVNlY3JldCcsXG4gICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkxpc3RTZWNyZXRWZXJzaW9uSWRzJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbbWFzdGVyVXNlclNlY3JldC5zZWNyZXRBcm5dLFxuICAgICAgfSkpO1xuXG4gICAgICBjb25zdCBwcm94eU9wdGlvbnM6IHJkcy5EYXRhYmFzZVByb3h5T3B0aW9ucyA9IHtcbiAgICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICAgIHNlY3JldHM6IFttYXN0ZXJVc2VyU2VjcmV0XSxcbiAgICAgICAgaWFtQXV0aDogdHJ1ZSxcbiAgICAgICAgZGJQcm94eU5hbWU6IGAke1N0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0tUkRTUHJveHlgLFxuICAgICAgICBzZWN1cml0eUdyb3VwczogW2RiQ29ubmVjdGlvbkdyb3VwXSxcbiAgICAgICAgcm9sZTogcmRzUHJveHlSb2xlLFxuICAgICAgICB2cGNTdWJuZXRzOiBwcm9wcy52cGNTdWJuZXRzLFxuICAgICAgfTtcblxuICAgICAgLy8gY3JlYXRlIHRoZSBSRFMgcHJveHlcbiAgICAgIHRoaXMucmRzUHJveHkgPSBkYkNsdXN0ZXIuYWRkUHJveHkoJ1JEU1Byb3h5JywgcHJveHlPcHRpb25zKTtcbiAgICAgIC8vIGVuc3VyZSBEQiBpbnN0YW5jZSBpcyByZWFkeSBiZWZvcmUgY3JlYXRpbmcgdGhlIHByb3h5XG4gICAgICB0aGlzLnJkc1Byb3h5Py5ub2RlLmFkZERlcGVuZGVuY3koY2ZuRGJJbnN0YW5jZSk7XG4gICAgfVxuICB9XG59XG4iXX0=