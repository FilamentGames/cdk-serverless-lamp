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
                ...props.environment,
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
            vpc: props.databaseOptions.instanceProps.vpc,
        });
        dbConnectionGroup.connections.allowInternally(aws_cdk_lib_1.aws_ec2.Port.tcp(3306));
        const dbCluster = new aws_cdk_lib_1.aws_rds.DatabaseCluster(this, 'DBCluster', {
            ...props.databaseOptions,
            instanceProps: {
                ...props.databaseOptions.instanceProps,
                securityGroups: [dbConnectionGroup],
            },
            credentials: aws_cdk_lib_1.aws_rds.Credentials.fromSecret(masterUserSecret),
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
                vpc: props.databaseOptions.instanceProps.vpc,
                secrets: [masterUserSecret],
                iamAuth: true,
                dbProxyName: `${aws_cdk_lib_1.Stack.of(this).stackName}-RDSProxy`,
                securityGroups: [dbConnectionGroup],
                role: rdsProxyRole,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFDQSw2QkFBNkI7QUFDN0IsOERBQThEO0FBQzlELHNHQUFxRjtBQUNyRiw2Q0FPcUI7QUFDckIsMkNBQXVDO0FBeUV2Qzs7R0FFRztBQUNILE1BQWEsYUFBYyxTQUFRLHNCQUFTO0lBSzFDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBeUI7UUFDakUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLHlCQUF5QixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLDRCQUE0QixDQUFDLENBQUM7UUFDckYsTUFBTSxzQkFBc0IsR0FBRyxPQUFPLENBQUM7UUFFdkMsSUFBSSxDQUFDLEdBQUcsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDO1FBRXJCLElBQUksQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQU8sSUFBSSxJQUFJLHdCQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUU7WUFDbkUsT0FBTyxFQUFFLHdCQUFNLENBQUMsT0FBTyxDQUFDLFlBQVk7WUFDcEMsT0FBTyxFQUFFLGtCQUFrQjtZQUMzQixNQUFNLEVBQUU7Z0JBQ04sd0JBQU0sQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsZ0JBQWdCLENBQUM7YUFDdEY7WUFDRCxJQUFJLEVBQUUsd0JBQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxjQUFjLElBQUkseUJBQXlCLENBQUM7WUFDL0UsV0FBVyxFQUFFO2dCQUNYLFdBQVcsRUFBRSxNQUFNO2dCQUNuQixTQUFTLEVBQUUsS0FBSyxDQUFDLGNBQWMsRUFBRSxjQUFjLElBQUksRUFBRTtnQkFDckQsU0FBUyxFQUFFLEtBQUssQ0FBQyxjQUFjLEVBQUUs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RSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsQ0FBQzthQUN4QyxDQUFDLENBQUMsQ0FBQztZQUVKLE1BQU0sWUFBWSxHQUE2QjtnQkFDN0MsR0FBRyxLQUFLLENBQUMsZUFBZTtnQkFDeEIsR0FBRyxFQUFFLEtBQUssQ0FBQyxlQUFlLENBQUMsYUFBYSxDQUFDLEdBQUc7Z0JBQzVDLE9BQU8sRUFBRSxDQUFDLGdCQUFnQixDQUFDO2dCQUMzQixPQUFPLEVBQUUsSUFBSTtnQkFDYixXQUFXLEVBQUUsR0FBRyxtQkFBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLFdBQVc7Z0JBQ25ELGNBQWMsRUFBRSxDQUFDLGlCQUFpQixDQUFDO2dCQUNuQyxJQUFJLEVBQUUsWUFBWTthQUNuQixDQUFDO1lBRUYsdUJBQXVCO1lBQ3ZCLElBQUksQ0FBQyxRQUFRLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsWUFBWSxDQUFDLENBQUM7WUFDN0Qsd0RBQXdEO1lBQ3hELElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQztTQUNsRDtJQUNILENBQUM7O0FBN0VILDBDQThFQyIsInNvdXJjZXNDb250ZW50IjpbIlxuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXl2Mi1hbHBoYSc7XG5pbXBvcnQgeyBIdHRwTGFtYmRhSW50ZWdyYXRpb24gfSBmcm9tICdAYXdzLWNkay9hd3MtYXBpZ2F0ZXdheXYyLWludGVncmF0aW9ucy1hbHBoYSc7XG5pbXBvcnQge1xuICBTdGFjaywgQ2ZuT3V0cHV0LCBEdXJhdGlvbixcbiAgYXdzX2VjMiBhcyBlYzIsXG4gIGF3c19pYW0gYXMgaWFtLFxuICBhd3NfbGFtYmRhIGFzIGxhbWJkYSxcbiAgYXdzX3JkcyBhcyByZHMsXG4gIGF3c19zZWNyZXRzbWFuYWdlciBhcyBzZWNyZXRzbWFuYWdlcixcbn0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cblxuZXhwb3J0IGludGVyZmFjZSBEYXRhYmFzZUNvbmZpZyB7XG4gIC8qKlxuICAgKiBUaGUgREIgd3JpdGVyIGVuZHBvaW50XG4gICAqL1xuICByZWFkb25seSB3cml0ZXJFbmRwb2ludDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgREIgcmVhZGVyIGVuZHBvaW50XG4gICAqL1xuICByZWFkb25seSByZWFkZXJFbmRwb2ludD86IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIERCIG1hc3RlciB1c2VybmFtZVxuICAgKi9cbiAgcmVhZG9ubHkgbWFzdGVyVXNlck5hbWU/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBEQiBtYXN0ZXIgcGFzc3dvcmQgc2VjcmV0XG4gICAqL1xuICByZWFkb25seSBtYXN0ZXJVc2VyUGFzc3dvcmRTZWNyZXQ/OiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xufVxuXG4vKipcbiAqIENvbnN0cnVjdCBwcm9wZXJ0aWVzIGZvciBgU2VydmVybGVzc0FwaWBcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTZXJ2ZXJsZXNzQXBpUHJvcHMge1xuICAvKipcbiAgICogY3VzdG9tIGxhbWJkYSBmdW5jdGlvbiBmb3IgdGhlIEFQSVxuICAgKlxuICAgKiBAZGVmYXVsdCAtIEEgTGFtYmRhIGZ1bmN0aW9uIHdpdGggTGF2YXZlbCBhbmQgQnJlZiBzdXBwb3J0IHdpbGwgYmUgY3JlYXRlZFxuICAgKi9cbiAgcmVhZG9ubHkgaGFuZGxlcj86IGxhbWJkYS5JRnVuY3Rpb247XG5cbiAgLyoqXG4gICAqIGN1c3RvbSBsYW1iZGEgY29kZSBhc3NldCBwYXRoXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gREVGQVVMVF9MQU1CREFfQVNTRVRfUEFUSFxuICAgKi9cbiAgcmVhZG9ubHkgbGFtYmRhQ29kZVBhdGg/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEFXUyBMYW1iZGEgbGF5ZXIgdmVyc2lvbiBmcm9tIHRoZSBCcmVmIHJ1bnRpbWUuXG4gICAqIGUuZy4gYXJuOmF3czpsYW1iZGE6dXMtd2VzdC0xOjIwOTQ5NzQwMDY5ODpsYXllcjpwaHAtNzQtZnBtOjEyXG4gICAqIGNoZWNrIHRoZSBsYXRlc3QgcnVudGltZSB2ZXJpb24gYXJuIGF0IGh0dHBzOi8vYnJlZi5zaC9kb2NzL3J1bnRpbWVzL1xuICAgKi9cbiAgcmVhZG9ubHkgYnJlZkxheWVyVmVyc2lvbjogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgVlBDIGZvciB0aGlzIHN0YWNrXG4gICAqL1xuICByZWFkb25seSB2cGM/OiBlYzIuSVZwYztcblxuICAvKipcbiAgICogRGF0YWJhc2UgY29uZmlndXJhdGlvbnNcbiAgICovXG4gIHJlYWRvbmx5IGRhdGFiYXNlQ29uZmlnPzogRGF0YWJhc2VDb25maWc7XG5cbiAgLyoqXG4gICAqIFJEUyBQcm94eSBmb3IgdGhlIExhbWJkYSBmdW5jdGlvblxuICAgKlxuICAgKiBAZGVmYXVsdCAtIG5vIGRiIHByb3h5XG4gICAqL1xuICByZWFkb25seSByZHNQcm94eT86IHJkcy5JRGF0YWJhc2VQcm94eTtcblxuICAvKipcbiAgICogQWRkaXRpb25hbCBhcHAgZW52aXJvbm1lbnQgdmFyaWFibGVzXG4gICAqL1xuICByZWFkb25seSBlbnZpcm9ubWVudD86IHtba2V5OnN0cmluZ106IHN0cmluZ307XG59XG5cbi8qKlxuICogVXNlIGBTZXJ2ZXJsZXNzQXBpYCB0byBjcmVhdGUgdGhlIHNlcnZlcmxlc3MgQVBJIHJlc291cmNlXG4gKi9cbmV4cG9ydCBjbGFzcyBTZXJ2ZXJsZXNzQXBpIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcmVhZG9ubHkgaGFuZGxlcjogbGFtYmRhLklGdW5jdGlvbjtcbiAgcmVhZG9ubHkgdnBjPzogZWMyLklWcGM7XG4gIHJlYWRvbmx5IGVuZHBvaW50OiBhcGlnYXRld2F5Lkh0dHBBcGk7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFNlcnZlcmxlc3NBcGlQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCBERUZBVUxUX0xBTUJEQV9BU1NFVF9QQVRIID0gcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2NvbXBvc2VyL2xhcmF2ZWw1OC1icmVmJyk7XG4gICAgY29uc3QgREVGQVVMVF9EQl9NQVNURVJfVVNFUiA9ICdhZG1pbic7XG5cbiAgICB0aGlzLnZwYyA9IHByb3BzLnZwYztcblxuICAgIHRoaXMuaGFuZGxlciA9IHByb3BzLmhhbmRsZXIgPz8gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnaGFuZGxlcicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBST1ZJREVEX0FMMixcbiAgICAgIGhhbmRsZXI6ICdwdWJsaWMvaW5kZXgucGhwJyxcbiAgICAgIGxheWVyczogW1xuICAgICAgICBsYW1iZGEuTGF5ZXJWZXJzaW9uLmZyb21MYXllclZlcnNpb25Bcm4odGhpcywgJ0JyZWZQSFBMYXllcicsIHByb3BzLmJyZWZMYXllclZlcnNpb24pLFxuICAgICAgXSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwcm9wcz8ubGFtYmRhQ29kZVBhdGggPz8gREVGQVVMVF9MQU1CREFfQVNTRVRfUEFUSCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBBUFBfU1RPUkFHRTogJy90bXAnLFxuICAgICAgICBEQl9XUklURVI6IHByb3BzLmRhdGFiYXNlQ29uZmlnPy53cml0ZXJFbmRwb2ludCA/PyAnJyxcbiAgICAgICAgREJfUkVBREVSOiBwcm9wcy5kYXRhYmFzZUNvbmZpZz8ucmVhZGVyRW5kcG9pbnQgPz8gcHJvcHMuZGF0YWJhc2VDb25maWc/LndyaXRlckVuZHBvaW50ID8/ICcnLFxuICAgICAgICBEQl9VU0VSOiBwcm9wcy5kYXRhYmFzZUNvbmZpZz8ubWFzdGVyVXNlck5hbWUgPz8gREVGQVVMVF9EQl9NQVNURVJfVVNFUixcbiAgICAgICAgLi4ucHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygxMjApLFxuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgfSk7XG5cbiAgICAvLyBhbGxvdyBsYW1iZGEgZXhlY3V0aW9uIHJvbGUgdG8gY29ubmVjdCB0byBSRFMgcHJveHlcbiAgICBpZiAocHJvcHMucmRzUHJveHkpIHtcbiAgICAgIHRoaXMuaGFuZGxlci5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbJ3Jkcy1kYjpjb25uZWN0J10sXG4gICAgICAgIHJlc291cmNlczogW3Byb3BzLnJkc1Byb3h5LmRiUHJveHlBcm5dLFxuICAgICAgfSkpO1xuICAgIH1cblxuICAgIGNvbnN0IGVuZHBvaW50ID0gdGhpcy5lbmRwb2ludCA9IG5ldyBhcGlnYXRld2F5Lkh0dHBBcGkodGhpcywgJ2FwaXNlcnZpY2UnLCB7XG4gICAgICBkZWZhdWx0SW50ZWdyYXRpb246IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ2xhbWJkYUhhbmRsZXInLCB0aGlzLmhhbmRsZXIpLFxuICAgIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0VuZHBvaW50VVJMJywgeyB2YWx1ZTogZW5kcG9pbnQudXJsISB9KTtcbiAgfVxufVxuXG4vKipcbiAqIENvbnN0cnVjdCBwcm9wZXJ0aWVzIGZvciBgU2VydmVybGVzc0xhcmF2ZWxgXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2VydmVybGVzc0xhcmF2ZWxQcm9wcyBleHRlbmRzIFNlcnZlcmxlc3NBcGlQcm9wcyB7XG4gIC8qKlxuICAgKiBwYXRoIHRvIHlvdXIgbG9jYWwgbGFyYXZlbCBkaXJlY3Rvcnkgd2l0aCBicmVmXG4gICAqL1xuICByZWFkb25seSBsYXJhdmVsUGF0aDogc3RyaW5nO1xuXG59XG5cbi8qKlxuICogVXNlIGBTZXJ2ZXJsZXNzTGFyYXZlbGAgdG8gY3JlYXRlIHRoZSBzZXJ2ZXJsZXNzIExhcmF2ZWwgcmVzb3VyY2VcbiAqL1xuZXhwb3J0IGNsYXNzIFNlcnZlcmxlc3NMYXJhdmVsIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcmVhZG9ubHkgYXBpOlNlcnZlcmxlc3NBcGk7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFNlcnZlcmxlc3NMYXJhdmVsUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuICAgIHRoaXMuYXBpID0gbmV3IFNlcnZlcmxlc3NBcGkodGhpcywgaWQsIHtcbiAgICAgIGxhbWJkYUNvZGVQYXRoOiBwcm9wcy5sYXJhdmVsUGF0aCxcbiAgICAgIGJyZWZMYXllclZlcnNpb246IHByb3BzLmJyZWZMYXllclZlcnNpb24sXG4gICAgICBoYW5kbGVyOiBwcm9wcy5oYW5kbGVyLFxuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICBkYXRhYmFzZUNvbmZpZzogcHJvcHMuZGF0YWJhc2VDb25maWcsXG4gICAgICByZHNQcm94eTogcHJvcHMucmRzUHJveHksXG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBEYXRhYmFzZVByb3BzIHtcbiAgLyoqXG4gICAqIG1hc3RlciB1c2VybmFtZVxuICAgKlxuICAgKiBAZGVmYXVsdCBhZG1pblxuICAgKi9cbiAgcmVhZG9ubHkgbWFzdGVyVXNlck5hbWU/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIGVuYWJsZSB0aGUgQW1hem9uIFJEUyBwcm94eVxuICAgKlxuICAgKiBAZGVmYXVsdCB0cnVlXG4gICAqL1xuICByZWFkb25seSByZHNQcm94eT86IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIEFkZGl0aW9uYWwgUkRTIFByb3h5IE9wdGlvbnNcbiAgICovXG4gIHJlYWRvbmx5IHJkc1Byb3h5T3B0aW9ucz86IHJkcy5EYXRhYmFzZVByb3h5T3B0aW9ucztcblxuICAvKipcbiAgICogRGVmaW5lIGNsdXN0ZXIgb3B0aW9uc1xuICAgKi9cbiAgcmVhZG9ubHkgZGF0YWJhc2VPcHRpb25zOiByZHMuRGF0YWJhc2VDbHVzdGVyUHJvcHM7XG59XG5cbmV4cG9ydCBjbGFzcyBEYXRhYmFzZUNsdXN0ZXIgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICByZWFkb25seSByZHNQcm94eT86IHJkcy5EYXRhYmFzZVByb3h5O1xuICByZWFkb25seSBtYXN0ZXJVc2VyOiBzdHJpbmc7XG4gIHJlYWRvbmx5IG1hc3RlclBhc3N3b3JkOiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBEYXRhYmFzZVByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIHRoaXMubWFzdGVyVXNlciA9IHByb3BzLm1hc3RlclVzZXJOYW1lID8/ICdhZG1pbic7XG5cbiAgICAvLyBnZW5lcmF0ZSBhbmQgc3RvcmUgcGFzc3dvcmQgZm9yIG1hc3RlclVzZXIgaW4gdGhlIHNlY3JldHMgbWFuYWdlclxuICAgIGNvbnN0IG1hc3RlclVzZXJTZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdEYk1hc3RlclNlY3JldCcsIHtcbiAgICAgIHNlY3JldE5hbWU6IGAke1N0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0tRGJNYXN0ZXJTZWNyZXRgLFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgc2VjcmV0U3RyaW5nVGVtcGxhdGU6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICB1c2VybmFtZTogdGhpcy5tYXN0ZXJVc2VyLFxuICAgICAgICB9KSxcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDEyLFxuICAgICAgICBleGNsdWRlUHVuY3R1YXRpb246IHRydWUsXG4gICAgICAgIGluY2x1ZGVTcGFjZTogZmFsc2UsXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiAncGFzc3dvcmQnLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMubWFzdGVyUGFzc3dvcmQgPSBtYXN0ZXJVc2VyU2VjcmV0O1xuXG4gICAgY29uc3QgZGJDb25uZWN0aW9uR3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0RCIFNlY3VyaXR5IEdyb3VwJywge1xuICAgICAgdnBjOiBwcm9wcy5kYXRhYmFzZU9wdGlvbnMuaW5zdGFuY2VQcm9wcy52cGMsXG4gICAgfSk7XG4gICAgZGJDb25uZWN0aW9uR3JvdXAuY29ubmVjdGlvbnMuYWxsb3dJbnRlcm5hbGx5KGVjMi5Qb3J0LnRjcCgzMzA2KSk7XG5cbiAgICBjb25zdCBkYkNsdXN0ZXIgPSBuZXcgcmRzLkRhdGFiYXNlQ2x1c3Rlcih0aGlzLCAnREJDbHVzdGVyJywge1xuICAgICAgLi4ucHJvcHMuZGF0YWJhc2VPcHRpb25zLFxuICAgICAgaW5zdGFuY2VQcm9wczoge1xuICAgICAgICAuLi5wcm9wcy5kYXRhYmFzZU9wdGlvbnMuaW5zdGFuY2VQcm9wcyxcbiAgICAgICAgc2VjdXJpdHlHcm91cHM6IFtkYkNvbm5lY3Rpb25Hcm91cF0sXG4gICAgICB9LFxuICAgICAgY3JlZGVudGlhbHM6IHJkcy5DcmVkZW50aWFscy5mcm9tU2VjcmV0KG1hc3RlclVzZXJTZWNyZXQpLFxuICAgIH0pO1xuXG4gICAgLy8gV29ya2Fyb3VuZCBmb3IgYnVnIHdoZXJlIFRhcmdldEdyb3VwTmFtZSBpcyBub3Qgc2V0IGJ1dCByZXF1aXJlZFxuICAgIGxldCBjZm5EYkluc3RhbmNlID0gZGJDbHVzdGVyLm5vZGUuY2hpbGRyZW4uZmluZCgoY2hpbGQ6IGFueSkgPT4ge1xuICAgICAgcmV0dXJuIGNoaWxkIGluc3RhbmNlb2YgcmRzLkNmbkRCSW5zdGFuY2U7XG4gICAgfSkgYXMgcmRzLkNmbkRCSW5zdGFuY2U7XG5cbiAgICAvLyBlbmFibGUgdGhlIFJEUyBwcm94eSBieSBkZWZhdWx0XG4gICAgaWYgKHByb3BzLnJkc1Byb3h5ICE9PSBmYWxzZSkge1xuICAgICAgLy8gY3JlYXRlIGlhbSByb2xlIGZvciBSRFMgcHJveHlcbiAgICAgIGNvbnN0IHJkc1Byb3h5Um9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnUmRzUHJveHlSb2xlJywge1xuICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgncmRzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIH0pO1xuICAgICAgLy8gc2VlOiBodHRwczovL2F3cy5hbWF6b24uY29tL3R3L2Jsb2dzL2NvbXB1dGUvdXNpbmctYW1hem9uLXJkcy1wcm94eS13aXRoLWF3cy1sYW1iZGEvXG4gICAgICByZHNQcm94eVJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkdldFJlc291cmNlUG9saWN5JyxcbiAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6R2V0U2VjcmV0VmFsdWUnLFxuICAgICAgICAgICdzZWNyZXRzbWFuYWdlcjpEZXNjcmliZVNlY3JldCcsXG4gICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkxpc3RTZWNyZXRWZXJzaW9uSWRzJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbbWFzdGVyVXNlclNlY3JldC5zZWNyZXRBcm5dLFxuICAgICAgfSkpO1xuXG4gICAgICBjb25zdCBwcm94eU9wdGlvbnM6IHJkcy5EYXRhYmFzZVByb3h5T3B0aW9ucyA9IHtcbiAgICAgICAgLi4ucHJvcHMucmRzUHJveHlPcHRpb25zLFxuICAgICAgICB2cGM6IHByb3BzLmRhdGFiYXNlT3B0aW9ucy5pbnN0YW5jZVByb3BzLnZwYyxcbiAgICAgICAgc2VjcmV0czogW21hc3RlclVzZXJTZWNyZXRdLFxuICAgICAgICBpYW1BdXRoOiB0cnVlLFxuICAgICAgICBkYlByb3h5TmFtZTogYCR7U3RhY2sub2YodGhpcykuc3RhY2tOYW1lfS1SRFNQcm94eWAsXG4gICAgICAgIHNlY3VyaXR5R3JvdXBzOiBbZGJDb25uZWN0aW9uR3JvdXBdLFxuICAgICAgICByb2xlOiByZHNQcm94eVJvbGUsXG4gICAgICB9O1xuXG4gICAgICAvLyBjcmVhdGUgdGhlIFJEUyBwcm94eVxuICAgICAgdGhpcy5yZHNQcm94eSA9IGRiQ2x1c3Rlci5hZGRQcm94eSgnUkRTUHJveHknLCBwcm94eU9wdGlvbnMpO1xuICAgICAgLy8gZW5zdXJlIERCIGluc3RhbmNlIGlzIHJlYWR5IGJlZm9yZSBjcmVhdGluZyB0aGUgcHJveHlcbiAgICAgIHRoaXMucmRzUHJveHk/Lm5vZGUuYWRkRGVwZW5kZW5jeShjZm5EYkluc3RhbmNlKTtcbiAgICB9XG4gIH1cbn1cbiJdfQ==