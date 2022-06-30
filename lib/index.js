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
            ...props.extraDatabaseOptions,
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
                ...props.rdsProxyOptions,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFDQSw2QkFBNkI7QUFDN0IsOERBQThEO0FBQzlELHNHQUFxRjtBQUNyRiw2Q0FPcUI7QUFDckIsMkNBQXVDO0FBcUV2Qzs7R0FFRztBQUNILE1BQWEsYUFBYyxTQUFRLHNCQUFTO0lBSzFDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBeUI7UUFDakUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLHlCQUF5QixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLDRCQUE0QixDQUFDLENBQUM7UUFDckYsTUFBTSxzQkFBc0IsR0FBRyxPQUFPLENBQUM7UUFFdkMsSUFBSSxDQUFDLEdBQUcsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDO1FBRXJCLElBQUksQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQU8sSUFBSSxJQUFJLHdCQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUU7WUFDbkUsT0FBTyxFQUFFLHdCQUFNLENBQUMsT0FBTyxDQUFDLFlBQVk7WUFDcEMsT0FBTyxFQUFFLGtCQUFrQjtZQUMzQixNQUFNLEVBQUU7Z0JBQ04sd0JBQU0sQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsZ0JBQWdCLENBQUM7YUFDdEY7WUFDRCxJQUFJLEVBQUUsd0JBQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxjQUFjLElBQUkseUJBQXlCLENBQUM7WUFDL0UsV0FBVyxFQUFFO2dCQUNYLFdBQVcsRUFBRSxNQUFNO2dCQUNuQixTQUFTLEVBQUUsS0FBSyxDQUFDLGNBQWMsRUFBRSxjQUFjLElBQUksRUFBRTtnQkFDckQsU0FBUyxFQUFFLEtBQUssQ0FBQyxjQUFjLEVBQUUs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SSxxQkFBRyxDQUFDLGdCQUFnQixDQUFDLG1CQUFtQixDQUFDO2FBQ3pELENBQUMsQ0FBQztZQUNILHVGQUF1RjtZQUN2RixZQUFZLENBQUMsV0FBVyxDQUFDLElBQUkscUJBQUcsQ0FBQyxlQUFlLENBQUM7Z0JBQy9DLE9BQU8sRUFBRTtvQkFDUCxrQ0FBa0M7b0JBQ2xDLCtCQUErQjtvQkFDL0IsK0JBQStCO29CQUMvQixxQ0FBcUM7aUJBQ3RDO2dCQUNELFNBQVMsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsQ0FBQzthQUN4QyxDQUFDLENBQUMsQ0FBQztZQUVKLE1BQU0sWUFBWSxHQUE2QjtnQkFDN0MsR0FBRyxLQUFLLENBQUMsZUFBZTtnQkFDeEIsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO2dCQUNkLE9BQU8sRUFBRSxDQUFDLGdCQUFnQixDQUFDO2dCQUMzQixPQUFPLEVBQUUsSUFBSTtnQkFDYixXQUFXLEVBQUUsR0FBRyxtQkFBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLFdBQVc7Z0JBQ25ELGNBQWMsRUFBRSxDQUFDLGlCQUFpQixDQUFDO2dCQUNuQyxJQUFJLEVBQUUsWUFBWTtnQkFDbEIsVUFBVSxFQUFFLEtBQUssQ0FBQyxVQUFVO2FBQzdCLENBQUM7WUFFRix1QkFBdUI7WUFDdkIsSUFBSSxDQUFDLFFBQVEsR0FBRyxTQUFTLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxZQUFZLENBQUMsQ0FBQztZQUM3RCx3REFBd0Q7WUFDeEQsSUFBSSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1NBQ2xEO0lBQ0gsQ0FBQzs7QUFwRkgsMENBcUZDIiwic291cmNlc0NvbnRlbnQiOlsiXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdAYXdzLWNkay9hd3MtYXBpZ2F0ZXdheXYyLWFscGhhJztcbmltcG9ydCB7IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbiB9IGZyb20gJ0Bhd3MtY2RrL2F3cy1hcGlnYXRld2F5djItaW50ZWdyYXRpb25zLWFscGhhJztcbmltcG9ydCB7XG4gIFN0YWNrLCBDZm5PdXRwdXQsIER1cmF0aW9uLFxuICBhd3NfZWMyIGFzIGVjMixcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIGF3c19sYW1iZGEgYXMgbGFtYmRhLFxuICBhd3NfcmRzIGFzIHJkcyxcbiAgYXdzX3NlY3JldHNtYW5hZ2VyIGFzIHNlY3JldHNtYW5hZ2VyLFxufSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuXG5leHBvcnQgaW50ZXJmYWNlIERhdGFiYXNlQ29uZmlnIHtcbiAgLyoqXG4gICAqIFRoZSBEQiB3cml0ZXIgZW5kcG9pbnRcbiAgICovXG4gIHJlYWRvbmx5IHdyaXRlckVuZHBvaW50OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBEQiByZWFkZXIgZW5kcG9pbnRcbiAgICovXG4gIHJlYWRvbmx5IHJlYWRlckVuZHBvaW50Pzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgREIgbWFzdGVyIHVzZXJuYW1lXG4gICAqL1xuICByZWFkb25seSBtYXN0ZXJVc2VyTmFtZT86IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIERCIG1hc3RlciBwYXNzd29yZCBzZWNyZXRcbiAgICovXG4gIHJlYWRvbmx5IG1hc3RlclVzZXJQYXNzd29yZFNlY3JldD86IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG59XG5cbi8qKlxuICogQ29uc3RydWN0IHByb3BlcnRpZXMgZm9yIGBTZXJ2ZXJsZXNzQXBpYFxuICovXG5leHBvcnQgaW50ZXJmYWNlIFNlcnZlcmxlc3NBcGlQcm9wcyB7XG4gIC8qKlxuICAgKiBjdXN0b20gbGFtYmRhIGZ1bmN0aW9uIGZvciB0aGUgQVBJXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gQSBMYW1iZGEgZnVuY3Rpb24gd2l0aCBMYXZhdmVsIGFuZCBCcmVmIHN1cHBvcnQgd2lsbCBiZSBjcmVhdGVkXG4gICAqL1xuICByZWFkb25seSBoYW5kbGVyPzogbGFtYmRhLklGdW5jdGlvbjtcblxuICAvKipcbiAgICogY3VzdG9tIGxhbWJkYSBjb2RlIGFzc2V0IHBhdGhcbiAgICpcbiAgICogQGRlZmF1bHQgLSBERUZBVUxUX0xBTUJEQV9BU1NFVF9QQVRIXG4gICAqL1xuICByZWFkb25seSBsYW1iZGFDb2RlUGF0aD86IHN0cmluZztcblxuICAvKipcbiAgICogQVdTIExhbWJkYSBsYXllciB2ZXJzaW9uIGZyb20gdGhlIEJyZWYgcnVudGltZS5cbiAgICogZS5nLiBhcm46YXdzOmxhbWJkYTp1cy13ZXN0LTE6MjA5NDk3NDAwNjk4OmxheWVyOnBocC03NC1mcG06MTJcbiAgICogY2hlY2sgdGhlIGxhdGVzdCBydW50aW1lIHZlcmlvbiBhcm4gYXQgaHR0cHM6Ly9icmVmLnNoL2RvY3MvcnVudGltZXMvXG4gICAqL1xuICByZWFkb25seSBicmVmTGF5ZXJWZXJzaW9uOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBWUEMgZm9yIHRoaXMgc3RhY2tcbiAgICovXG4gIHJlYWRvbmx5IHZwYz86IGVjMi5JVnBjO1xuXG4gIC8qKlxuICAgKiBEYXRhYmFzZSBjb25maWd1cmF0aW9uc1xuICAgKi9cbiAgcmVhZG9ubHkgZGF0YWJhc2VDb25maWc/OiBEYXRhYmFzZUNvbmZpZztcblxuICAvKipcbiAgICogUkRTIFByb3h5IGZvciB0aGUgTGFtYmRhIGZ1bmN0aW9uXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gbm8gZGIgcHJveHlcbiAgICovXG4gIHJlYWRvbmx5IHJkc1Byb3h5PzogcmRzLklEYXRhYmFzZVByb3h5O1xuXG59XG5cbi8qKlxuICogVXNlIGBTZXJ2ZXJsZXNzQXBpYCB0byBjcmVhdGUgdGhlIHNlcnZlcmxlc3MgQVBJIHJlc291cmNlXG4gKi9cbmV4cG9ydCBjbGFzcyBTZXJ2ZXJsZXNzQXBpIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcmVhZG9ubHkgaGFuZGxlcjogbGFtYmRhLklGdW5jdGlvbjtcbiAgcmVhZG9ubHkgdnBjPzogZWMyLklWcGM7XG4gIHJlYWRvbmx5IGVuZHBvaW50OiBhcGlnYXRld2F5Lkh0dHBBcGk7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFNlcnZlcmxlc3NBcGlQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCBERUZBVUxUX0xBTUJEQV9BU1NFVF9QQVRIID0gcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2NvbXBvc2VyL2xhcmF2ZWw1OC1icmVmJyk7XG4gICAgY29uc3QgREVGQVVMVF9EQl9NQVNURVJfVVNFUiA9ICdhZG1pbic7XG5cbiAgICB0aGlzLnZwYyA9IHByb3BzLnZwYztcblxuICAgIHRoaXMuaGFuZGxlciA9IHByb3BzLmhhbmRsZXIgPz8gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnaGFuZGxlcicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBST1ZJREVEX0FMMixcbiAgICAgIGhhbmRsZXI6ICdwdWJsaWMvaW5kZXgucGhwJyxcbiAgICAgIGxheWVyczogW1xuICAgICAgICBsYW1iZGEuTGF5ZXJWZXJzaW9uLmZyb21MYXllclZlcnNpb25Bcm4odGhpcywgJ0JyZWZQSFBMYXllcicsIHByb3BzLmJyZWZMYXllclZlcnNpb24pLFxuICAgICAgXSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwcm9wcz8ubGFtYmRhQ29kZVBhdGggPz8gREVGQVVMVF9MQU1CREFfQVNTRVRfUEFUSCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBBUFBfU1RPUkFHRTogJy90bXAnLFxuICAgICAgICBEQl9XUklURVI6IHByb3BzLmRhdGFiYXNlQ29uZmlnPy53cml0ZXJFbmRwb2ludCA/PyAnJyxcbiAgICAgICAgREJfUkVBREVSOiBwcm9wcy5kYXRhYmFzZUNvbmZpZz8ucmVhZGVyRW5kcG9pbnQgPz8gcHJvcHMuZGF0YWJhc2VDb25maWc/LndyaXRlckVuZHBvaW50ID8/ICcnLFxuICAgICAgICBEQl9VU0VSOiBwcm9wcy5kYXRhYmFzZUNvbmZpZz8ubWFzdGVyVXNlck5hbWUgPz8gREVGQVVMVF9EQl9NQVNURVJfVVNFUixcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDEyMCksXG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICB9KTtcblxuICAgIC8vIGFsbG93IGxhbWJkYSBleGVjdXRpb24gcm9sZSB0byBjb25uZWN0IHRvIFJEUyBwcm94eVxuICAgIGlmIChwcm9wcy5yZHNQcm94eSkge1xuICAgICAgdGhpcy5oYW5kbGVyLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFsncmRzLWRiOmNvbm5lY3QnXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbcHJvcHMucmRzUHJveHkuZGJQcm94eUFybl0sXG4gICAgICB9KSk7XG4gICAgfVxuXG4gICAgY29uc3QgZW5kcG9pbnQgPSB0aGlzLmVuZHBvaW50ID0gbmV3IGFwaWdhdGV3YXkuSHR0cEFwaSh0aGlzLCAnYXBpc2VydmljZScsIHtcbiAgICAgIGRlZmF1bHRJbnRlZ3JhdGlvbjogbmV3IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbignbGFtYmRhSGFuZGxlcicsIHRoaXMuaGFuZGxlciksXG4gICAgfSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRW5kcG9pbnRVUkwnLCB7IHZhbHVlOiBlbmRwb2ludC51cmwhIH0pO1xuICB9XG59XG5cbi8qKlxuICogQ29uc3RydWN0IHByb3BlcnRpZXMgZm9yIGBTZXJ2ZXJsZXNzTGFyYXZlbGBcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTZXJ2ZXJsZXNzTGFyYXZlbFByb3BzIGV4dGVuZHMgU2VydmVybGVzc0FwaVByb3BzIHtcbiAgLyoqXG4gICAqIHBhdGggdG8geW91ciBsb2NhbCBsYXJhdmVsIGRpcmVjdG9yeSB3aXRoIGJyZWZcbiAgICovXG4gIHJlYWRvbmx5IGxhcmF2ZWxQYXRoOiBzdHJpbmc7XG5cbn1cblxuLyoqXG4gKiBVc2UgYFNlcnZlcmxlc3NMYXJhdmVsYCB0byBjcmVhdGUgdGhlIHNlcnZlcmxlc3MgTGFyYXZlbCByZXNvdXJjZVxuICovXG5leHBvcnQgY2xhc3MgU2VydmVybGVzc0xhcmF2ZWwgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICByZWFkb25seSBhcGk6U2VydmVybGVzc0FwaTtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU2VydmVybGVzc0xhcmF2ZWxQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG4gICAgdGhpcy5hcGkgPSBuZXcgU2VydmVybGVzc0FwaSh0aGlzLCBpZCwge1xuICAgICAgbGFtYmRhQ29kZVBhdGg6IHByb3BzLmxhcmF2ZWxQYXRoLFxuICAgICAgYnJlZkxheWVyVmVyc2lvbjogcHJvcHMuYnJlZkxheWVyVmVyc2lvbixcbiAgICAgIGhhbmRsZXI6IHByb3BzLmhhbmRsZXIsXG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgIGRhdGFiYXNlQ29uZmlnOiBwcm9wcy5kYXRhYmFzZUNvbmZpZyxcbiAgICAgIHJkc1Byb3h5OiBwcm9wcy5yZHNQcm94eSxcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIERhdGFiYXNlUHJvcHMge1xuICAvKipcbiAgICogZGF0YWJhc2UgY2x1c3RlciBlbmdpbmVcbiAgICpcbiAgICogQGRlZmF1bHQgQVVST1JBX01ZU1FMXG4gICAqL1xuICByZWFkb25seSBlbmdpbmU/OiByZHMuSUNsdXN0ZXJFbmdpbmU7XG5cbiAgLyoqXG4gICAqIG1hc3RlciB1c2VybmFtZVxuICAgKlxuICAgKiBAZGVmYXVsdCBhZG1pblxuICAgKi9cbiAgcmVhZG9ubHkgbWFzdGVyVXNlck5hbWU/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBWUEMgZm9yIHRoZSBEYXRhYmFzZUNsdXN0ZXJcbiAgICovXG4gIHJlYWRvbmx5IHZwYzogZWMyLklWcGM7XG5cbiAgLyoqXG4gICAqIGluc3RhbmNlIHR5cGUgb2YgdGhlIGNsdXN0ZXJcbiAgICpcbiAgICogQGRlZmF1bHQgLSB0My5tZWRpdW0gKG9yLCBtb3JlIHByZWNpc2VseSwgZGIudDMubWVkaXVtKVxuICAgKi9cbiAgcmVhZG9ubHkgaW5zdGFuY2VUeXBlPzogZWMyLkluc3RhbmNlVHlwZTtcblxuICAvKipcbiAgICogZW5hYmxlIHRoZSBBbWF6b24gUkRTIHByb3h5XG4gICAqXG4gICAqIEBkZWZhdWx0IHRydWVcbiAgICovXG4gIHJlYWRvbmx5IHJkc1Byb3h5PzogYm9vbGVhbjtcblxuICAvKipcbiAgICogQWRkaXRpb25hbCBSRFMgUHJveHkgT3B0aW9uc1xuICAgKi9cbiAgcmVhZG9ubHkgcmRzUHJveHlPcHRpb25zPzogcmRzLkRhdGFiYXNlUHJveHlPcHRpb25zO1xuXG4gIC8qKlxuICAgKiBIb3cgbWFueSByZXBsaWNhcy9pbnN0YW5jZXMgdG8gY3JlYXRlLiBIYXMgdG8gYmUgYXQgbGVhc3QgMS5cbiAgICpcbiAgICogQGRlZmF1bHQgMVxuICAgKi9cbiAgcmVhZG9ubHkgaW5zdGFuY2VDYXBhY2l0eT86IG51bWJlcjtcblxuICAvKipcbiAgICogTGlzdCBvZiBzdWJuZXRzIHRvIHVzZSB3aGVuIGNyZWF0aW5nIHN1Ym5ldCBncm91cC5cbiAgICovXG4gIHJlYWRvbmx5IHZwY1N1Ym5ldHM/OiBlYzIuU3VibmV0U2VsZWN0aW9uO1xuXG4gIC8qKlxuICAgKiBEZWZpbmUgYWRkaXRpb25hbCBjbHVzdGVyIG9wdGlvbnNcbiAgICovXG4gIHJlYWRvbmx5IGV4dHJhRGF0YWJhc2VPcHRpb25zPzogcmRzLkRhdGFiYXNlQ2x1c3RlclByb3BzO1xufVxuXG5leHBvcnQgY2xhc3MgRGF0YWJhc2VDbHVzdGVyIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcmVhZG9ubHkgcmRzUHJveHk/OiByZHMuRGF0YWJhc2VQcm94eTtcbiAgcmVhZG9ubHkgbWFzdGVyVXNlcjogc3RyaW5nO1xuICByZWFkb25seSBtYXN0ZXJQYXNzd29yZDogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogRGF0YWJhc2VQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICB0aGlzLm1hc3RlclVzZXIgPSBwcm9wcy5tYXN0ZXJVc2VyTmFtZSA/PyAnYWRtaW4nO1xuXG4gICAgLy8gZ2VuZXJhdGUgYW5kIHN0b3JlIHBhc3N3b3JkIGZvciBtYXN0ZXJVc2VyIGluIHRoZSBzZWNyZXRzIG1hbmFnZXJcbiAgICBjb25zdCBtYXN0ZXJVc2VyU2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnRGJNYXN0ZXJTZWNyZXQnLCB7XG4gICAgICBzZWNyZXROYW1lOiBgJHtTdGFjay5vZih0aGlzKS5zdGFja05hbWV9LURiTWFzdGVyU2VjcmV0YCxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgdXNlcm5hbWU6IHRoaXMubWFzdGVyVXNlcixcbiAgICAgICAgfSksXG4gICAgICAgIHBhc3N3b3JkTGVuZ3RoOiAxMixcbiAgICAgICAgZXhjbHVkZVB1bmN0dWF0aW9uOiB0cnVlLFxuICAgICAgICBpbmNsdWRlU3BhY2U6IGZhbHNlLFxuICAgICAgICBnZW5lcmF0ZVN0cmluZ0tleTogJ3Bhc3N3b3JkJyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLm1hc3RlclBhc3N3b3JkID0gbWFzdGVyVXNlclNlY3JldDtcblxuICAgIGNvbnN0IGRiQ29ubmVjdGlvbkdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdEQiBTZWN1cml0eSBHcm91cCcsIHtcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgIH0pO1xuICAgIGRiQ29ubmVjdGlvbkdyb3VwLmNvbm5lY3Rpb25zLmFsbG93SW50ZXJuYWxseShlYzIuUG9ydC50Y3AoMzMwNikpO1xuXG4gICAgY29uc3QgZGJDbHVzdGVyID0gbmV3IHJkcy5EYXRhYmFzZUNsdXN0ZXIodGhpcywgJ0RCQ2x1c3RlcicsIHtcbiAgICAgIC4uLnByb3BzLmV4dHJhRGF0YWJhc2VPcHRpb25zLFxuICAgICAgZW5naW5lOiBwcm9wcy5lbmdpbmUgPz8gcmRzLkRhdGFiYXNlQ2x1c3RlckVuZ2luZS5hdXJvcmFNeXNxbCh7XG4gICAgICAgIHZlcnNpb246IHJkcy5BdXJvcmFNeXNxbEVuZ2luZVZlcnNpb24uVkVSXzJfMDhfMSxcbiAgICAgIH0pLFxuICAgICAgaW5zdGFuY2VQcm9wczoge1xuICAgICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgICAgaW5zdGFuY2VUeXBlOiBwcm9wcy5pbnN0YW5jZVR5cGUgPz8gbmV3IGVjMi5JbnN0YW5jZVR5cGUoJ3QzLm1lZGl1bScpLFxuICAgICAgICBzZWN1cml0eUdyb3VwczogW2RiQ29ubmVjdGlvbkdyb3VwXSxcbiAgICAgICAgdnBjU3VibmV0czogcHJvcHMudnBjU3VibmV0cyxcbiAgICAgIH0sXG4gICAgICBjcmVkZW50aWFsczogcmRzLkNyZWRlbnRpYWxzLmZyb21TZWNyZXQobWFzdGVyVXNlclNlY3JldCksXG4gICAgICBpbnN0YW5jZXM6IHByb3BzLmluc3RhbmNlQ2FwYWNpdHksXG4gICAgfSk7XG5cbiAgICAvLyBXb3JrYXJvdW5kIGZvciBidWcgd2hlcmUgVGFyZ2V0R3JvdXBOYW1lIGlzIG5vdCBzZXQgYnV0IHJlcXVpcmVkXG4gICAgbGV0IGNmbkRiSW5zdGFuY2UgPSBkYkNsdXN0ZXIubm9kZS5jaGlsZHJlbi5maW5kKChjaGlsZDogYW55KSA9PiB7XG4gICAgICByZXR1cm4gY2hpbGQgaW5zdGFuY2VvZiByZHMuQ2ZuREJJbnN0YW5jZTtcbiAgICB9KSBhcyByZHMuQ2ZuREJJbnN0YW5jZTtcblxuICAgIC8vIGVuYWJsZSB0aGUgUkRTIHByb3h5IGJ5IGRlZmF1bHRcbiAgICBpZiAocHJvcHMucmRzUHJveHkgIT09IGZhbHNlKSB7XG4gICAgICAvLyBjcmVhdGUgaWFtIHJvbGUgZm9yIFJEUyBwcm94eVxuICAgICAgY29uc3QgcmRzUHJveHlSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdSZHNQcm94eVJvbGUnLCB7XG4gICAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdyZHMuYW1hem9uYXdzLmNvbScpLFxuICAgICAgfSk7XG4gICAgICAvLyBzZWU6IGh0dHBzOi8vYXdzLmFtYXpvbi5jb20vdHcvYmxvZ3MvY29tcHV0ZS91c2luZy1hbWF6b24tcmRzLXByb3h5LXdpdGgtYXdzLWxhbWJkYS9cbiAgICAgIHJkc1Byb3h5Um9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6R2V0UmVzb3VyY2VQb2xpY3knLFxuICAgICAgICAgICdzZWNyZXRzbWFuYWdlcjpHZXRTZWNyZXRWYWx1ZScsXG4gICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkRlc2NyaWJlU2VjcmV0JyxcbiAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6TGlzdFNlY3JldFZlcnNpb25JZHMnLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFttYXN0ZXJVc2VyU2VjcmV0LnNlY3JldEFybl0sXG4gICAgICB9KSk7XG5cbiAgICAgIGNvbnN0IHByb3h5T3B0aW9uczogcmRzLkRhdGFiYXNlUHJveHlPcHRpb25zID0ge1xuICAgICAgICAuLi5wcm9wcy5yZHNQcm94eU9wdGlvbnMsXG4gICAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgICBzZWNyZXRzOiBbbWFzdGVyVXNlclNlY3JldF0sXG4gICAgICAgIGlhbUF1dGg6IHRydWUsXG4gICAgICAgIGRiUHJveHlOYW1lOiBgJHtTdGFjay5vZih0aGlzKS5zdGFja05hbWV9LVJEU1Byb3h5YCxcbiAgICAgICAgc2VjdXJpdHlHcm91cHM6IFtkYkNvbm5lY3Rpb25Hcm91cF0sXG4gICAgICAgIHJvbGU6IHJkc1Byb3h5Um9sZSxcbiAgICAgICAgdnBjU3VibmV0czogcHJvcHMudnBjU3VibmV0cyxcbiAgICAgIH07XG5cbiAgICAgIC8vIGNyZWF0ZSB0aGUgUkRTIHByb3h5XG4gICAgICB0aGlzLnJkc1Byb3h5ID0gZGJDbHVzdGVyLmFkZFByb3h5KCdSRFNQcm94eScsIHByb3h5T3B0aW9ucyk7XG4gICAgICAvLyBlbnN1cmUgREIgaW5zdGFuY2UgaXMgcmVhZHkgYmVmb3JlIGNyZWF0aW5nIHRoZSBwcm94eVxuICAgICAgdGhpcy5yZHNQcm94eT8ubm9kZS5hZGREZXBlbmRlbmN5KGNmbkRiSW5zdGFuY2UpO1xuICAgIH1cbiAgfVxufVxuIl19