"use strict";
var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerlessLaravelConsole = exports.ServerlessConsole = exports.DatabaseCluster = exports.ServerlessLaravel = exports.ServerlessApi = void 0;
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
                DB_USERNAME: props.databaseConfig?.masterUserName ?? DEFAULT_DB_MASTER_USER,
                ...props.environment,
            },
            timeout: aws_cdk_lib_1.Duration.seconds(120),
            vpc: props.vpc,
            tracing: props.tracing,
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
            disableExecuteApiEndpoint: props.disableExecuteApiEndpoint,
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
class ServerlessLaravel extends ServerlessApi {
    constructor(scope, id, props) {
        super(scope, id, props);
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
        const dbConnectionGroup = this.dbConnectionGroup = new aws_cdk_lib_1.aws_ec2.SecurityGroup(this, 'DB Security Group', {
            vpc: props.databaseOptions.instanceProps.vpc,
            allowAllOutbound: false,
        });
        const dbCluster = this.dbCluster = new aws_cdk_lib_1.aws_rds.DatabaseCluster(this, 'DBCluster', {
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
/**
 * Use `ServerlessConsole` to create the serverless console resource
 */
class ServerlessConsole extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const DEFAULT_LAMBDA_ASSET_PATH = path.join(__dirname, '../composer/laravel58-bref');
        const DEFAULT_DB_MASTER_USER = 'admin';
        this.vpc = props.vpc;
        this.handler = new aws_cdk_lib_1.aws_lambda.Function(this, 'handler', {
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.PROVIDED_AL2,
            handler: props.handler,
            layers: [
                aws_cdk_lib_1.aws_lambda.LayerVersion.fromLayerVersionArn(this, 'PHPLayer', props.phpLayerVersion),
                aws_cdk_lib_1.aws_lambda.LayerVersion.fromLayerVersionArn(this, 'ConsoleLayer', props.consoleLayerVersion),
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
    }
}
exports.ServerlessConsole = ServerlessConsole;
_d = JSII_RTTI_SYMBOL_1;
ServerlessConsole[_d] = { fqn: "cdk-serverless-lamp.ServerlessConsole", version: "0.0.0" };
class ServerlessLaravelConsole extends ServerlessConsole {
    constructor(scope, id, props) {
        super(scope, id, {
            ...props,
            handler: props.handler ?? 'artisan',
        });
    }
}
exports.ServerlessLaravelConsole = ServerlessLaravelConsole;
_e = JSII_RTTI_SYMBOL_1;
ServerlessLaravelConsole[_e] = { fqn: "cdk-serverless-lamp.ServerlessLaravelConsole", version: "0.0.0" };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFDQSw2QkFBNkI7QUFDN0IsOERBQThEO0FBQzlELHNHQUFxRjtBQUNyRiw2Q0FPcUI7QUFHckIsMkNBQXVDO0FBcUZ2Qzs7R0FFRztBQUNILE1BQWEsYUFBYyxTQUFRLHNCQUFTO0lBSzFDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBeUI7UUFDakUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLHlCQUF5QixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLDRCQUE0QixDQUFDLENBQUM7UUFDckYsTUFBTSxzQkFBc0IsR0FBRyxPQUFPLENBQUM7UUFFdkMsSUFBSSxDQUFDLEdBQUcsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDO1FBRXJCLElBQUksQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQU8sSUFBSSxJQUFJLHdCQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUU7WUFDbkUsT0FBTyxFQUFFLHdCQUFNLENBQUMsT0FBTyxDQUFDLFlBQVk7WUFDcEMsT0FBTyxFQUFFLGtCQUFrQjtZQUMzQixNQUFNLEVBQUU7Z0JBQ04sd0JBQU0sQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsZ0JBQWdCLENBQUM7YUFDdEY7WUFDRCxJQUFJLEVBQUUsd0JBQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxjQUFjLElBQUkseUJBQXlCLENBQUM7WUFDL0UsV0FBVyxFQUFFO2dCQUNYLFdBQVcsRUFBRSxNQUFNO2dCQUNuQixTQUFTLEVBQUUsS0FBSyxDQUFDLGNBQWMsRUFBRSxjQUFjLElBQUksRUFBRTtnQkFDckQsU0FBUyxFQUFFLEtBQUssQ0FBQyxjQUFjLEVBQUUs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bSAncGF0aCc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ0Bhd3MtY2RrL2F3cy1hcGlnYXRld2F5djItYWxwaGEnO1xuaW1wb3J0IHsgSHR0cExhbWJkYUludGVncmF0aW9uIH0gZnJvbSAnQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXl2Mi1pbnRlZ3JhdGlvbnMtYWxwaGEnO1xuaW1wb3J0IHtcbiAgU3RhY2ssIENmbk91dHB1dCwgRHVyYXRpb24sXG4gIGF3c19lYzIgYXMgZWMyLFxuICBhd3NfaWFtIGFzIGlhbSxcbiAgYXdzX2xhbWJkYSBhcyBsYW1iZGEsXG4gIGF3c19yZHMgYXMgcmRzLFxuICBhd3Nfc2VjcmV0c21hbmFnZXIgYXMgc2VjcmV0c21hbmFnZXIsXG59IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IElTZWN1cml0eUdyb3VwIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XG5pbXBvcnQgeyBJRGF0YWJhc2VDbHVzdGVyIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLXJkcyc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuXG5leHBvcnQgaW50ZXJmYWNlIERhdGFiYXNlQ29uZmlnIHtcbiAgLyoqXG4gICAqIFRoZSBEQiB3cml0ZXIgZW5kcG9pbnRcbiAgICovXG4gIHJlYWRvbmx5IHdyaXRlckVuZHBvaW50OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBEQiByZWFkZXIgZW5kcG9pbnRcbiAgICovXG4gIHJlYWRvbmx5IHJlYWRlckVuZHBvaW50Pzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgREIgbWFzdGVyIHVzZXJuYW1lXG4gICAqL1xuICByZWFkb25seSBtYXN0ZXJVc2VyTmFtZT86IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIERCIG1hc3RlciBwYXNzd29yZCBzZWNyZXRcbiAgICovXG4gIHJlYWRvbmx5IG1hc3RlclVzZXJQYXNzd29yZFNlY3JldD86IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG59XG5cbi8qKlxuICogQ29uc3RydWN0IHByb3BlcnRpZXMgZm9yIGBTZXJ2ZXJsZXNzQXBpYFxuICovXG5leHBvcnQgaW50ZXJmYWNlIFNlcnZlcmxlc3NBcGlQcm9wcyB7XG4gIC8qKlxuICAgKiBjdXN0b20gbGFtYmRhIGZ1bmN0aW9uIGZvciB0aGUgQVBJXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gQSBMYW1iZGEgZnVuY3Rpb24gd2l0aCBMYXZhdmVsIGFuZCBCcmVmIHN1cHBvcnQgd2lsbCBiZSBjcmVhdGVkXG4gICAqL1xuICByZWFkb25seSBoYW5kbGVyPzogbGFtYmRhLklGdW5jdGlvbjtcblxuICAvKipcbiAgICogY3VzdG9tIGxhbWJkYSBjb2RlIGFzc2V0IHBhdGhcbiAgICpcbiAgICogQGRlZmF1bHQgLSBERUZBVUxUX0xBTUJEQV9BU1NFVF9QQVRIXG4gICAqL1xuICByZWFkb25seSBsYW1iZGFDb2RlUGF0aD86IHN0cmluZztcblxuICAvKipcbiAgICogQVdTIExhbWJkYSBsYXllciB2ZXJzaW9uIGZyb20gdGhlIEJyZWYgcnVudGltZS5cbiAgICogZS5nLiBhcm46YXdzOmxhbWJkYTp1cy13ZXN0LTE6MjA5NDk3NDAwNjk4OmxheWVyOnBocC03NC1mcG06MTJcbiAgICogY2hlY2sgdGhlIGxhdGVzdCBydW50aW1lIHZlcmlvbiBhcm4gYXQgaHR0cHM6Ly9icmVmLnNoL2RvY3MvcnVudGltZXMvXG4gICAqL1xuICByZWFkb25seSBicmVmTGF5ZXJWZXJzaW9uOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBWUEMgZm9yIHRoaXMgc3RhY2tcbiAgICovXG4gIHJlYWRvbmx5IHZwYz86IGVjMi5JVnBjO1xuXG4gIC8qKlxuICAgKiBEYXRhYmFzZSBjb25maWd1cmF0aW9uc1xuICAgKi9cbiAgcmVhZG9ubHkgZGF0YWJhc2VDb25maWc/OiBEYXRhYmFzZUNvbmZpZztcblxuICAvKipcbiAgICogUkRTIFByb3h5IGZvciB0aGUgTGFtYmRhIGZ1bmN0aW9uXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gbm8gZGIgcHJveHlcbiAgICovXG4gIHJlYWRvbmx5IHJkc1Byb3h5PzogcmRzLklEYXRhYmFzZVByb3h5O1xuXG4gIC8qKlxuICAgKiBBZGRpdGlvbmFsIGFwcCBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICovXG4gIHJlYWRvbmx5IGVudmlyb25tZW50Pzoge1trZXk6c3RyaW5nXTogc3RyaW5nfTtcblxuICAvKipcbiAgICogV2hldGhlciB0byBkaXNhYmxlIHRoZSBkZWZhdWx0IGV4ZWN1dGUgYXBpIGVuZHBvaW50LlxuICAgKiBZb3UgY2FuIGVuYWJsZSB0aGlzIHdoZW4geW91IGhhdmUgYSBjdXN0b20gZG9tYWluIG1hcHBlZC5cbiAgICogQGRlZmF1bHQgLSBmYWxzZVxuICAgKi9cbiAgcmVhZG9ubHkgZGlzYWJsZUV4ZWN1dGVBcGlFbmRwb2ludD86IGJvb2xlYW47XG5cbiAgLypcbiAgICogV2hldGhlciB0byBhY3RpdmF0ZSB4LXJheSB0cmFjaW5nXG4gICAqL1xuICByZWFkb25seSB0cmFjaW5nPzogbGFtYmRhLlRyYWNpbmc7XG59XG5cbi8qKlxuICogVXNlIGBTZXJ2ZXJsZXNzQXBpYCB0byBjcmVhdGUgdGhlIHNlcnZlcmxlc3MgQVBJIHJlc291cmNlXG4gKi9cbmV4cG9ydCBjbGFzcyBTZXJ2ZXJsZXNzQXBpIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcmVhZG9ubHkgaGFuZGxlcjogbGFtYmRhLklGdW5jdGlvbjtcbiAgcmVhZG9ubHkgdnBjPzogZWMyLklWcGM7XG4gIHJlYWRvbmx5IGVuZHBvaW50OiBhcGlnYXRld2F5Lkh0dHBBcGk7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFNlcnZlcmxlc3NBcGlQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCBERUZBVUxUX0xBTUJEQV9BU1NFVF9QQVRIID0gcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2NvbXBvc2VyL2xhcmF2ZWw1OC1icmVmJyk7XG4gICAgY29uc3QgREVGQVVMVF9EQl9NQVNURVJfVVNFUiA9ICdhZG1pbic7XG5cbiAgICB0aGlzLnZwYyA9IHByb3BzLnZwYztcblxuICAgIHRoaXMuaGFuZGxlciA9IHByb3BzLmhhbmRsZXIgPz8gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnaGFuZGxlcicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBST1ZJREVEX0FMMixcbiAgICAgIGhhbmRsZXI6ICdwdWJsaWMvaW5kZXgucGhwJyxcbiAgICAgIGxheWVyczogW1xuICAgICAgICBsYW1iZGEuTGF5ZXJWZXJzaW9uLmZyb21MYXllclZlcnNpb25Bcm4odGhpcywgJ0JyZWZQSFBMYXllcicsIHByb3BzLmJyZWZMYXllclZlcnNpb24pLFxuICAgICAgXSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwcm9wcz8ubGFtYmRhQ29kZVBhdGggPz8gREVGQVVMVF9MQU1CREFfQVNTRVRfUEFUSCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBBUFBfU1RPUkFHRTogJy90bXAnLFxuICAgICAgICBEQl9XUklURVI6IHByb3BzLmRhdGFiYXNlQ29uZmlnPy53cml0ZXJFbmRwb2ludCA/PyAnJyxcbiAgICAgICAgREJfUkVBREVSOiBwcm9wcy5kYXRhYmFzZUNvbmZpZz8ucmVhZGVyRW5kcG9pbnQgPz8gcHJvcHMuZGF0YWJhc2VDb25maWc/LndyaXRlckVuZHBvaW50ID8/ICcnLFxuICAgICAgICBEQl9VU0VSTkFNRTogcHJvcHMuZGF0YWJhc2VDb25maWc/Lm1hc3RlclVzZXJOYW1lID8/IERFRkFVTFRfREJfTUFTVEVSX1VTRVIsXG4gICAgICAgIC4uLnByb3BzLmVudmlyb25tZW50LFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMTIwKSxcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgdHJhY2luZzogcHJvcHMudHJhY2luZyxcbiAgICB9KTtcblxuICAgIC8vIGFsbG93IGxhbWJkYSBleGVjdXRpb24gcm9sZSB0byBjb25uZWN0IHRvIFJEUyBwcm94eVxuICAgIGlmIChwcm9wcy5yZHNQcm94eSkge1xuICAgICAgdGhpcy5oYW5kbGVyLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFsncmRzLWRiOmNvbm5lY3QnXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbcHJvcHMucmRzUHJveHkuZGJQcm94eUFybl0sXG4gICAgICB9KSk7XG4gICAgfVxuXG4gICAgY29uc3QgZW5kcG9pbnQgPSB0aGlzLmVuZHBvaW50ID0gbmV3IGFwaWdhdGV3YXkuSHR0cEFwaSh0aGlzLCAnYXBpc2VydmljZScsIHtcbiAgICAgIGRlZmF1bHRJbnRlZ3JhdGlvbjogbmV3IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbignbGFtYmRhSGFuZGxlcicsIHRoaXMuaGFuZGxlciksXG4gICAgICBkaXNhYmxlRXhlY3V0ZUFwaUVuZHBvaW50OiBwcm9wcy5kaXNhYmxlRXhlY3V0ZUFwaUVuZHBvaW50LFxuICAgIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0VuZHBvaW50VVJMJywgeyB2YWx1ZTogZW5kcG9pbnQudXJsISB9KTtcbiAgfVxufVxuXG4vKipcbiAqIENvbnN0cnVjdCBwcm9wZXJ0aWVzIGZvciBgU2VydmVybGVzc0xhcmF2ZWxgXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2VydmVybGVzc0xhcmF2ZWxQcm9wcyBleHRlbmRzIFNlcnZlcmxlc3NBcGlQcm9wcyB7XG5cbn1cblxuLyoqXG4gKiBVc2UgYFNlcnZlcmxlc3NMYXJhdmVsYCB0byBjcmVhdGUgdGhlIHNlcnZlcmxlc3MgTGFyYXZlbCByZXNvdXJjZVxuICovXG5leHBvcnQgY2xhc3MgU2VydmVybGVzc0xhcmF2ZWwgZXh0ZW5kcyBTZXJ2ZXJsZXNzQXBpIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFNlcnZlcmxlc3NMYXJhdmVsUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcbiAgfVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIERhdGFiYXNlUHJvcHMge1xuICAvKipcbiAgICogbWFzdGVyIHVzZXJuYW1lXG4gICAqXG4gICAqIEBkZWZhdWx0IGFkbWluXG4gICAqL1xuICByZWFkb25seSBtYXN0ZXJVc2VyTmFtZT86IHN0cmluZztcblxuICAvKipcbiAgICogZW5hYmxlIHRoZSBBbWF6b24gUkRTIHByb3h5XG4gICAqXG4gICAqIEBkZWZhdWx0IHRydWVcbiAgICovXG4gIHJlYWRvbmx5IHJkc1Byb3h5PzogYm9vbGVhbjtcblxuICAvKipcbiAgICogQWRkaXRpb25hbCBSRFMgUHJveHkgT3B0aW9uc1xuICAgKi9cbiAgcmVhZG9ubHkgcmRzUHJveHlPcHRpb25zPzogcmRzLkRhdGFiYXNlUHJveHlPcHRpb25zO1xuXG4gIC8qKlxuICAgKiBEZWZpbmUgY2x1c3RlciBvcHRpb25zXG4gICAqL1xuICByZWFkb25seSBkYXRhYmFzZU9wdGlvbnM6IHJkcy5EYXRhYmFzZUNsdXN0ZXJQcm9wcztcbn1cblxuZXhwb3J0IGNsYXNzIERhdGFiYXNlQ2x1c3RlciBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHJlYWRvbmx5IHJkc1Byb3h5PzogcmRzLkRhdGFiYXNlUHJveHk7XG4gIHJlYWRvbmx5IG1hc3RlclVzZXI6IHN0cmluZztcbiAgcmVhZG9ubHkgbWFzdGVyUGFzc3dvcmQ6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG4gIHJlYWRvbmx5IGRiQ29ubmVjdGlvbkdyb3VwOiBJU2VjdXJpdHlHcm91cDtcbiAgcmVhZG9ubHkgZGJDbHVzdGVyOiBJRGF0YWJhc2VDbHVzdGVyO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBEYXRhYmFzZVByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIHRoaXMubWFzdGVyVXNlciA9IHByb3BzLm1hc3RlclVzZXJOYW1lID8/ICdhZG1pbic7XG5cbiAgICAvLyBnZW5lcmF0ZSBhbmQgc3RvcmUgcGFzc3dvcmQgZm9yIG1hc3RlclVzZXIgaW4gdGhlIHNlY3JldHMgbWFuYWdlclxuICAgIGNvbnN0IG1hc3RlclVzZXJTZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdEYk1hc3RlclNlY3JldCcsIHtcbiAgICAgIHNlY3JldE5hbWU6IGAke1N0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0tRGJNYXN0ZXJTZWNyZXRgLFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgc2VjcmV0U3RyaW5nVGVtcGxhdGU6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICB1c2VybmFtZTogdGhpcy5tYXN0ZXJVc2VyLFxuICAgICAgICB9KSxcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDEyLFxuICAgICAgICBleGNsdWRlUHVuY3R1YXRpb246IHRydWUsXG4gICAgICAgIGluY2x1ZGVTcGFjZTogZmFsc2UsXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiAncGFzc3dvcmQnLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMubWFzdGVyUGFzc3dvcmQgPSBtYXN0ZXJVc2VyU2VjcmV0O1xuXG4gICAgY29uc3QgZGJDb25uZWN0aW9uR3JvdXAgPSB0aGlzLmRiQ29ubmVjdGlvbkdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdEQiBTZWN1cml0eSBHcm91cCcsIHtcbiAgICAgIHZwYzogcHJvcHMuZGF0YWJhc2VPcHRpb25zLmluc3RhbmNlUHJvcHMudnBjLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2UsXG4gICAgfSk7XG5cbiAgICBjb25zdCBkYkNsdXN0ZXIgPSB0aGlzLmRiQ2x1c3RlciA9IG5ldyByZHMuRGF0YWJhc2VDbHVzdGVyKHRoaXMsICdEQkNsdXN0ZXInLCB7XG4gICAgICAuLi5wcm9wcy5kYXRhYmFzZU9wdGlvbnMsXG4gICAgICBpbnN0YW5jZVByb3BzOiB7XG4gICAgICAgIC4uLnByb3BzLmRhdGFiYXNlT3B0aW9ucy5pbnN0YW5jZVByb3BzLFxuICAgICAgICBzZWN1cml0eUdyb3VwczogW2RiQ29ubmVjdGlvbkdyb3VwXSxcbiAgICAgIH0sXG4gICAgICBjcmVkZW50aWFsczogcmRzLkNyZWRlbnRpYWxzLmZyb21TZWNyZXQobWFzdGVyVXNlclNlY3JldCksXG4gICAgfSk7XG5cbiAgICAvLyBXb3JrYXJvdW5kIGZvciBidWcgd2hlcmUgVGFyZ2V0R3JvdXBOYW1lIGlzIG5vdCBzZXQgYnV0IHJlcXVpcmVkXG4gICAgbGV0IGNmbkRiSW5zdGFuY2UgPSBkYkNsdXN0ZXIubm9kZS5jaGlsZHJlbi5maW5kKChjaGlsZDogYW55KSA9PiB7XG4gICAgICByZXR1cm4gY2hpbGQgaW5zdGFuY2VvZiByZHMuQ2ZuREJJbnN0YW5jZTtcbiAgICB9KSBhcyByZHMuQ2ZuREJJbnN0YW5jZTtcblxuICAgIC8vIGVuYWJsZSB0aGUgUkRTIHByb3h5IGJ5IGRlZmF1bHRcbiAgICBpZiAocHJvcHMucmRzUHJveHkgIT09IGZhbHNlKSB7XG4gICAgICAvLyBjcmVhdGUgaWFtIHJvbGUgZm9yIFJEUyBwcm94eVxuICAgICAgY29uc3QgcmRzUHJveHlSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdSZHNQcm94eVJvbGUnLCB7XG4gICAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdyZHMuYW1hem9uYXdzLmNvbScpLFxuICAgICAgfSk7XG4gICAgICAvLyBzZWU6IGh0dHBzOi8vYXdzLmFtYXpvbi5jb20vdHcvYmxvZ3MvY29tcHV0ZS91c2luZy1hbWF6b24tcmRzLXByb3h5LXdpdGgtYXdzLWxhbWJkYS9cbiAgICAgIHJkc1Byb3h5Um9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6R2V0UmVzb3VyY2VQb2xpY3knLFxuICAgICAgICAgICdzZWNyZXRzbWFuYWdlcjpHZXRTZWNyZXRWYWx1ZScsXG4gICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkRlc2NyaWJlU2VjcmV0JyxcbiAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6TGlzdFNlY3JldFZlcnNpb25JZHMnLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFttYXN0ZXJVc2VyU2VjcmV0LnNlY3JldEFybl0sXG4gICAgICB9KSk7XG5cbiAgICAgIGNvbnN0IHByb3h5T3B0aW9uczogcmRzLkRhdGFiYXNlUHJveHlPcHRpb25zID0ge1xuICAgICAgICAuLi5wcm9wcy5yZHNQcm94eU9wdGlvbnMsXG4gICAgICAgIHZwYzogcHJvcHMuZGF0YWJhc2VPcHRpb25zLmluc3RhbmNlUHJvcHMudnBjLFxuICAgICAgICBzZWNyZXRzOiBbbWFzdGVyVXNlclNlY3JldF0sXG4gICAgICAgIGRiUHJveHlOYW1lOiBgJHtTdGFjay5vZih0aGlzKS5zdGFja05hbWV9LVJEU1Byb3h5YCxcbiAgICAgICAgc2VjdXJpdHlHcm91cHM6IFtkYkNvbm5lY3Rpb25Hcm91cF0sXG4gICAgICAgIHJvbGU6IHJkc1Byb3h5Um9sZSxcbiAgICAgIH07XG5cbiAgICAgIC8vIGNyZWF0ZSB0aGUgUkRTIHByb3h5XG4gICAgICB0aGlzLnJkc1Byb3h5ID0gZGJDbHVzdGVyLmFkZFByb3h5KCdSRFNQcm94eScsIHByb3h5T3B0aW9ucyk7XG4gICAgICAvLyBlbnN1cmUgREIgaW5zdGFuY2UgaXMgcmVhZHkgYmVmb3JlIGNyZWF0aW5nIHRoZSBwcm94eVxuICAgICAgdGhpcy5yZHNQcm94eT8ubm9kZS5hZGREZXBlbmRlbmN5KGNmbkRiSW5zdGFuY2UpO1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIENvbnN0cnVjdCBwcm9wZXJ0aWVzIGZvciBgU2VydmVybGVzc0FwaWBcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTZXJ2ZXJsZXNzQ29uc29sZVByb3BzIHtcbiAgLyoqXG4gICAqIHBhdGggdG8gY29uc29sZSBiaW5hcnkgcmVsYXRpdmUgdG8gbGFtYmRhQ29kZVBhdGhcbiAgICovXG4gIHJlYWRvbmx5IGhhbmRsZXI6IHN0cmluZztcblxuICAvKipcbiAgICogY3VzdG9tIGxhbWJkYSBjb2RlIGFzc2V0IHBhdGhcbiAgICpcbiAgICogQGRlZmF1bHQgLSBERUZBVUxUX0xBTUJEQV9BU1NFVF9QQVRIXG4gICAqL1xuICByZWFkb25seSBsYW1iZGFDb2RlUGF0aD86IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIGFybiBvZiB0aGUgcGhwIGxheWVyIHRvIHVzZVxuICAgKi9cbiAgcmVhZG9ubHkgcGhwTGF5ZXJWZXJzaW9uOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBhcm4gb2YgdGhlIGNvbnNvbGUgbGF5ZXIgdG8gdXNlXG4gICAqL1xuICByZWFkb25seSBjb25zb2xlTGF5ZXJWZXJzaW9uOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBWUEMgZm9yIHRoaXMgc3RhY2tcbiAgICovXG4gIHJlYWRvbmx5IHZwYz86IGVjMi5JVnBjO1xuXG4gIC8qKlxuICAgKiBEYXRhYmFzZSBjb25maWd1cmF0aW9uc1xuICAgKi9cbiAgcmVhZG9ubHkgZGF0YWJhc2VDb25maWc/OiBEYXRhYmFzZUNvbmZpZztcblxuICAvKipcbiAgICogUkRTIFByb3h5IGZvciB0aGUgTGFtYmRhIGZ1bmN0aW9uXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gbm8gZGIgcHJveHlcbiAgICovXG4gIHJlYWRvbmx5IHJkc1Byb3h5PzogcmRzLklEYXRhYmFzZVByb3h5O1xuXG4gIC8qKlxuICAgKiBBZGRpdGlvbmFsIGxhbWJkYSBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICovXG4gIHJlYWRvbmx5IGVudmlyb25tZW50PzogeyBba2V5OiBzdHJpbmddIDogc3RyaW5nIH07XG59XG5cbi8qKlxuICogVXNlIGBTZXJ2ZXJsZXNzQ29uc29sZWAgdG8gY3JlYXRlIHRoZSBzZXJ2ZXJsZXNzIGNvbnNvbGUgcmVzb3VyY2VcbiAqL1xuZXhwb3J0IGNsYXNzIFNlcnZlcmxlc3NDb25zb2xlIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcmVhZG9ubHkgaGFuZGxlcjogbGFtYmRhLklGdW5jdGlvbjtcbiAgcmVhZG9ubHkgdnBjPzogZWMyLklWcGM7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFNlcnZlcmxlc3NDb25zb2xlUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3QgREVGQVVMVF9MQU1CREFfQVNTRVRfUEFUSCA9IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9jb21wb3Nlci9sYXJhdmVsNTgtYnJlZicpO1xuICAgIGNvbnN0IERFRkFVTFRfREJfTUFTVEVSX1VTRVIgPSAnYWRtaW4nO1xuXG4gICAgdGhpcy52cGMgPSBwcm9wcy52cGM7XG5cbiAgICB0aGlzLmhhbmRsZXIgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdoYW5kbGVyJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFJPVklERURfQUwyLFxuICAgICAgaGFuZGxlcjogcHJvcHMuaGFuZGxlcixcbiAgICAgIGxheWVyczogW1xuICAgICAgICBsYW1iZGEuTGF5ZXJWZXJzaW9uLmZyb21MYXllclZlcnNpb25Bcm4odGhpcywgJ1BIUExheWVyJywgcHJvcHMucGhwTGF5ZXJWZXJzaW9uKSxcbiAgICAgICAgbGFtYmRhLkxheWVyVmVyc2lvbi5mcm9tTGF5ZXJWZXJzaW9uQXJuKHRoaXMsICdDb25zb2xlTGF5ZXInLCBwcm9wcy5jb25zb2xlTGF5ZXJWZXJzaW9uKSxcbiAgICAgIF0sXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocHJvcHM/LmxhbWJkYUNvZGVQYXRoID8/IERFRkFVTFRfTEFNQkRBX0FTU0VUX1BBVEgpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgQVBQX1NUT1JBR0U6ICcvdG1wJyxcbiAgICAgICAgREJfV1JJVEVSOiBwcm9wcy5kYXRhYmFzZUNvbmZpZz8ud3JpdGVyRW5kcG9pbnQgPz8gJycsXG4gICAgICAgIERCX1JFQURFUjogcHJvcHMuZGF0YWJhc2VDb25maWc/LnJlYWRlckVuZHBvaW50ID8/IHByb3BzLmRhdGFiYXNlQ29uZmlnPy53cml0ZXJFbmRwb2ludCA/PyAnJyxcbiAgICAgICAgREJfVVNFUjogcHJvcHMuZGF0YWJhc2VDb25maWc/Lm1hc3RlclVzZXJOYW1lID8/IERFRkFVTFRfREJfTUFTVEVSX1VTRVIsXG4gICAgICAgIC4uLnByb3BzLmVudmlyb25tZW50LFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMTIwKSxcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgIH0pO1xuXG4gICAgLy8gYWxsb3cgbGFtYmRhIGV4ZWN1dGlvbiByb2xlIHRvIGNvbm5lY3QgdG8gUkRTIHByb3h5XG4gICAgaWYgKHByb3BzLnJkc1Byb3h5KSB7XG4gICAgICB0aGlzLmhhbmRsZXIuYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogWydyZHMtZGI6Y29ubmVjdCddLFxuICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy5yZHNQcm94eS5kYlByb3h5QXJuXSxcbiAgICAgIH0pKTtcbiAgICB9XG4gIH1cbn1cblxuLyoqXG4gKiBDb25zdHJ1Y3QgcHJvcGVydGllcyBmb3IgYFNlcnZlcmxlc3NMYXJhdmVsYFxuICovXG5leHBvcnQgaW50ZXJmYWNlIFNlcnZlcmxlc3NMYXJhdmVsQ29uc29sZVByb3BzIHtcbiAgLyoqXG4gICAqIHBhdGggdG8gY29uc29sZSBiaW5hcnkgcmVsYXRpdmUgdG8gbGFtYmRhQ29kZVBhdGhcbiAgICogQGRlZmF1bHQgLSBhcnRpc2FuXG4gICAqL1xuICByZWFkb25seSBoYW5kbGVyPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBjdXN0b20gbGFtYmRhIGNvZGUgYXNzZXQgcGF0aFxuICAgKlxuICAgKiBAZGVmYXVsdCAtIERFRkFVTFRfTEFNQkRBX0FTU0VUX1BBVEhcbiAgICovXG4gIHJlYWRvbmx5IGxhbWJkYUNvZGVQYXRoPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgYXJuIG9mIHRoZSBwaHAgbGF5ZXIgdG8gdXNlXG4gICAqL1xuICByZWFkb25seSBwaHBMYXllclZlcnNpb246IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIGFybiBvZiB0aGUgY29uc29sZSBsYXllciB0byB1c2VcbiAgICovXG4gIHJlYWRvbmx5IGNvbnNvbGVMYXllclZlcnNpb246IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIFZQQyBmb3IgdGhpcyBzdGFja1xuICAgKi9cbiAgcmVhZG9ubHkgdnBjPzogZWMyLklWcGM7XG5cbiAgLyoqXG4gICAqIERhdGFiYXNlIGNvbmZpZ3VyYXRpb25zXG4gICAqL1xuICByZWFkb25seSBkYXRhYmFzZUNvbmZpZz86IERhdGFiYXNlQ29uZmlnO1xuXG4gIC8qKlxuICAgKiBSRFMgUHJveHkgZm9yIHRoZSBMYW1iZGEgZnVuY3Rpb25cbiAgICpcbiAgICogQGRlZmF1bHQgLSBubyBkYiBwcm94eVxuICAgKi9cbiAgcmVhZG9ubHkgcmRzUHJveHk/OiByZHMuSURhdGFiYXNlUHJveHk7XG5cbiAgLyoqXG4gICAqIEFkZGl0aW9uYWwgbGFtYmRhIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgKi9cbiAgcmVhZG9ubHkgZW52aXJvbm1lbnQ/OiB7IFtrZXk6IHN0cmluZ10gOiBzdHJpbmcgfTtcbn1cblxuZXhwb3J0IGNsYXNzIFNlcnZlcmxlc3NMYXJhdmVsQ29uc29sZSBleHRlbmRzIFNlcnZlcmxlc3NDb25zb2xlIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFNlcnZlcmxlc3NMYXJhdmVsQ29uc29sZVByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCB7XG4gICAgICAuLi5wcm9wcyxcbiAgICAgIGhhbmRsZXI6IHByb3BzLmhhbmRsZXIgPz8gJ2FydGlzYW4nLFxuICAgIH0pO1xuICB9XG59XG4iXX0=