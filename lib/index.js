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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFDQSw2QkFBNkI7QUFDN0IsOERBQThEO0FBQzlELHNHQUFxRjtBQUNyRiw2Q0FPcUI7QUFHckIsMkNBQXVDO0FBeUV2Qzs7R0FFRztBQUNILE1BQWEsYUFBYyxTQUFRLHNCQUFTO0lBSzFDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBeUI7UUFDakUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLHlCQUF5QixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLDRCQUE0QixDQUFDLENBQUM7UUFDckYsTUFBTSxzQkFBc0IsR0FBRyxPQUFPLENBQUM7UUFFdkMsSUFBSSxDQUFDLEdBQUcsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDO1FBRXJCLElBQUksQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQU8sSUFBSSxJQUFJLHdCQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUU7WUFDbkUsT0FBTyxFQUFFLHdCQUFNLENBQUMsT0FBTyxDQUFDLFlBQVk7WUFDcEMsT0FBTyxFQUFFLGtCQUFrQjtZQUMzQixNQUFNLEVBQUU7Z0JBQ04sd0JBQU0sQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsZ0JBQWdCLENBQUM7YUFDdEY7WUFDRCxJQUFJLEVBQUUsd0JBQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxjQUFjLElBQUkseUJBQXlCLENBQUM7WUFDL0UsV0FBVyxFQUFFO2dCQUNYLFdBQVcsRUFBRSxNQUFNO2dCQUNuQixTQUFTLEVBQUUsS0FBSyxDQUFDLGNBQWMsRUFBRSxjQUFjLElBQUksRUFBRTtnQkFDckQsU0FBUyxFQUFFLEtBQUssQ0FBQyxjQUFjLEVBQUUs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LGNBQWMsSUFBSSx5QkFBeUIsQ0FBQztZQUMvRSxXQUFXLEVBQUU7Z0JBQ1gsV0FBVyxFQUFFLE1BQU07Z0JBQ25CLFNBQVMsRUFBRSxLQUFLLENBQUMsY0FBYyxFQUFFLGNBQWMsSUFBSSxFQUFFO2dCQUNyRCxTQUFTLEVBQUUsS0FBSyxDQUFDLGNBQWMsRUFBRSxjQUFjLElBQUksS0FBSyxDQUFDLGNBQWMsRUFBRSxjQUFjLElBQUksRUFBRTtnQkFDN0YsT0FBTyxFQUFFLEtBQUssQ0FBQyxjQUFjLEVBQUUsY0FBYyxJQUFJLHNCQUFzQjtnQkFDdkUsR0FBRyxLQUFLLENBQUMsV0FBVzthQUNyQjtZQUNELE9BQU8sRUFBRSxzQkFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUM7WUFDOUIsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO1NBQ2YsQ0FBQyxDQUFDO1FBRUgsc0RBQXNEO1FBQ3RELElBQUksS0FBSyxDQUFDLFFBQVEsRUFBRTtZQUNsQixJQUFJLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxJQUFJLHFCQUFHLENBQUMsZUFBZSxDQUFDO2dCQUNuRCxPQUFPLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQztnQkFDM0IsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUM7YUFDdkMsQ0FBQyxDQUFDLENBQUM7U0FDTDtJQUNILENBQUM7O0FBdENILDhDQXVDQzs7O0FBb0RELE1BQWEsd0JBQXlCLFNBQVEsaUJBQWlCO0lBQzdELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBb0M7UUFDNUUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUU7WUFDZixHQUFHLEtBQUs7WUFDUixPQUFPLEVBQUUsS0FBSyxDQUFDLE9BQU8sSUFBSSxTQUFTO1NBQ3BDLENBQUMsQ0FBQztJQUNMLENBQUM7O0FBTkgsNERBT0MiLCJzb3VyY2VzQ29udGVudCI6WyJcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ0Bhd3MtY2RrL2F3cy1hcGlnYXRld2F5djItYWxwaGEnO1xuaW1wb3J0IHsgSHR0cExhbWJkYUludGVncmF0aW9uIH0gZnJvbSAnQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXl2Mi1pbnRlZ3JhdGlvbnMtYWxwaGEnO1xuaW1wb3J0IHtcbiAgU3RhY2ssIENmbk91dHB1dCwgRHVyYXRpb24sXG4gIGF3c19lYzIgYXMgZWMyLFxuICBhd3NfaWFtIGFzIGlhbSxcbiAgYXdzX2xhbWJkYSBhcyBsYW1iZGEsXG4gIGF3c19yZHMgYXMgcmRzLFxuICBhd3Nfc2VjcmV0c21hbmFnZXIgYXMgc2VjcmV0c21hbmFnZXIsXG59IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IElTZWN1cml0eUdyb3VwIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XG5pbXBvcnQgeyBJRGF0YWJhc2VDbHVzdGVyIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLXJkcyc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuXG5leHBvcnQgaW50ZXJmYWNlIERhdGFiYXNlQ29uZmlnIHtcbiAgLyoqXG4gICAqIFRoZSBEQiB3cml0ZXIgZW5kcG9pbnRcbiAgICovXG4gIHJlYWRvbmx5IHdyaXRlckVuZHBvaW50OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBEQiByZWFkZXIgZW5kcG9pbnRcbiAgICovXG4gIHJlYWRvbmx5IHJlYWRlckVuZHBvaW50Pzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgREIgbWFzdGVyIHVzZXJuYW1lXG4gICAqL1xuICByZWFkb25seSBtYXN0ZXJVc2VyTmFtZT86IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIERCIG1hc3RlciBwYXNzd29yZCBzZWNyZXRcbiAgICovXG4gIHJlYWRvbmx5IG1hc3RlclVzZXJQYXNzd29yZFNlY3JldD86IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG59XG5cbi8qKlxuICogQ29uc3RydWN0IHByb3BlcnRpZXMgZm9yIGBTZXJ2ZXJsZXNzQXBpYFxuICovXG5leHBvcnQgaW50ZXJmYWNlIFNlcnZlcmxlc3NBcGlQcm9wcyB7XG4gIC8qKlxuICAgKiBjdXN0b20gbGFtYmRhIGZ1bmN0aW9uIGZvciB0aGUgQVBJXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gQSBMYW1iZGEgZnVuY3Rpb24gd2l0aCBMYXZhdmVsIGFuZCBCcmVmIHN1cHBvcnQgd2lsbCBiZSBjcmVhdGVkXG4gICAqL1xuICByZWFkb25seSBoYW5kbGVyPzogbGFtYmRhLklGdW5jdGlvbjtcblxuICAvKipcbiAgICogY3VzdG9tIGxhbWJkYSBjb2RlIGFzc2V0IHBhdGhcbiAgICpcbiAgICogQGRlZmF1bHQgLSBERUZBVUxUX0xBTUJEQV9BU1NFVF9QQVRIXG4gICAqL1xuICByZWFkb25seSBsYW1iZGFDb2RlUGF0aD86IHN0cmluZztcblxuICAvKipcbiAgICogQVdTIExhbWJkYSBsYXllciB2ZXJzaW9uIGZyb20gdGhlIEJyZWYgcnVudGltZS5cbiAgICogZS5nLiBhcm46YXdzOmxhbWJkYTp1cy13ZXN0LTE6MjA5NDk3NDAwNjk4OmxheWVyOnBocC03NC1mcG06MTJcbiAgICogY2hlY2sgdGhlIGxhdGVzdCBydW50aW1lIHZlcmlvbiBhcm4gYXQgaHR0cHM6Ly9icmVmLnNoL2RvY3MvcnVudGltZXMvXG4gICAqL1xuICByZWFkb25seSBicmVmTGF5ZXJWZXJzaW9uOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBWUEMgZm9yIHRoaXMgc3RhY2tcbiAgICovXG4gIHJlYWRvbmx5IHZwYz86IGVjMi5JVnBjO1xuXG4gIC8qKlxuICAgKiBEYXRhYmFzZSBjb25maWd1cmF0aW9uc1xuICAgKi9cbiAgcmVhZG9ubHkgZGF0YWJhc2VDb25maWc/OiBEYXRhYmFzZUNvbmZpZztcblxuICAvKipcbiAgICogUkRTIFByb3h5IGZvciB0aGUgTGFtYmRhIGZ1bmN0aW9uXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gbm8gZGIgcHJveHlcbiAgICovXG4gIHJlYWRvbmx5IHJkc1Byb3h5PzogcmRzLklEYXRhYmFzZVByb3h5O1xuXG4gIC8qKlxuICAgKiBBZGRpdGlvbmFsIGFwcCBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICovXG4gIHJlYWRvbmx5IGVudmlyb25tZW50Pzoge1trZXk6c3RyaW5nXTogc3RyaW5nfTtcbn1cblxuLyoqXG4gKiBVc2UgYFNlcnZlcmxlc3NBcGlgIHRvIGNyZWF0ZSB0aGUgc2VydmVybGVzcyBBUEkgcmVzb3VyY2VcbiAqL1xuZXhwb3J0IGNsYXNzIFNlcnZlcmxlc3NBcGkgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICByZWFkb25seSBoYW5kbGVyOiBsYW1iZGEuSUZ1bmN0aW9uO1xuICByZWFkb25seSB2cGM/OiBlYzIuSVZwYztcbiAgcmVhZG9ubHkgZW5kcG9pbnQ6IGFwaWdhdGV3YXkuSHR0cEFwaTtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU2VydmVybGVzc0FwaVByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IERFRkFVTFRfTEFNQkRBX0FTU0VUX1BBVEggPSBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vY29tcG9zZXIvbGFyYXZlbDU4LWJyZWYnKTtcbiAgICBjb25zdCBERUZBVUxUX0RCX01BU1RFUl9VU0VSID0gJ2FkbWluJztcblxuICAgIHRoaXMudnBjID0gcHJvcHMudnBjO1xuXG4gICAgdGhpcy5oYW5kbGVyID0gcHJvcHMuaGFuZGxlciA/PyBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdoYW5kbGVyJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFJPVklERURfQUwyLFxuICAgICAgaGFuZGxlcjogJ3B1YmxpYy9pbmRleC5waHAnLFxuICAgICAgbGF5ZXJzOiBbXG4gICAgICAgIGxhbWJkYS5MYXllclZlcnNpb24uZnJvbUxheWVyVmVyc2lvbkFybih0aGlzLCAnQnJlZlBIUExheWVyJywgcHJvcHMuYnJlZkxheWVyVmVyc2lvbiksXG4gICAgICBdLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHByb3BzPy5sYW1iZGFDb2RlUGF0aCA/PyBERUZBVUxUX0xBTUJEQV9BU1NFVF9QQVRIKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEFQUF9TVE9SQUdFOiAnL3RtcCcsXG4gICAgICAgIERCX1dSSVRFUjogcHJvcHMuZGF0YWJhc2VDb25maWc/LndyaXRlckVuZHBvaW50ID8/ICcnLFxuICAgICAgICBEQl9SRUFERVI6IHByb3BzLmRhdGFiYXNlQ29uZmlnPy5yZWFkZXJFbmRwb2ludCA/PyBwcm9wcy5kYXRhYmFzZUNvbmZpZz8ud3JpdGVyRW5kcG9pbnQgPz8gJycsXG4gICAgICAgIERCX1VTRVI6IHByb3BzLmRhdGFiYXNlQ29uZmlnPy5tYXN0ZXJVc2VyTmFtZSA/PyBERUZBVUxUX0RCX01BU1RFUl9VU0VSLFxuICAgICAgICAuLi5wcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDEyMCksXG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICB9KTtcblxuICAgIC8vIGFsbG93IGxhbWJkYSBleGVjdXRpb24gcm9sZSB0byBjb25uZWN0IHRvIFJEUyBwcm94eVxuICAgIGlmIChwcm9wcy5yZHNQcm94eSkge1xuICAgICAgdGhpcy5oYW5kbGVyLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFsncmRzLWRiOmNvbm5lY3QnXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbcHJvcHMucmRzUHJveHkuZGJQcm94eUFybl0sXG4gICAgICB9KSk7XG4gICAgfVxuXG4gICAgY29uc3QgZW5kcG9pbnQgPSB0aGlzLmVuZHBvaW50ID0gbmV3IGFwaWdhdGV3YXkuSHR0cEFwaSh0aGlzLCAnYXBpc2VydmljZScsIHtcbiAgICAgIGRlZmF1bHRJbnRlZ3JhdGlvbjogbmV3IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbignbGFtYmRhSGFuZGxlcicsIHRoaXMuaGFuZGxlciksXG4gICAgfSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRW5kcG9pbnRVUkwnLCB7IHZhbHVlOiBlbmRwb2ludC51cmwhIH0pO1xuICB9XG59XG5cbi8qKlxuICogQ29uc3RydWN0IHByb3BlcnRpZXMgZm9yIGBTZXJ2ZXJsZXNzTGFyYXZlbGBcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTZXJ2ZXJsZXNzTGFyYXZlbFByb3BzIGV4dGVuZHMgU2VydmVybGVzc0FwaVByb3BzIHtcblxufVxuXG4vKipcbiAqIFVzZSBgU2VydmVybGVzc0xhcmF2ZWxgIHRvIGNyZWF0ZSB0aGUgc2VydmVybGVzcyBMYXJhdmVsIHJlc291cmNlXG4gKi9cbmV4cG9ydCBjbGFzcyBTZXJ2ZXJsZXNzTGFyYXZlbCBleHRlbmRzIFNlcnZlcmxlc3NBcGkge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU2VydmVybGVzc0xhcmF2ZWxQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuICB9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGF0YWJhc2VQcm9wcyB7XG4gIC8qKlxuICAgKiBtYXN0ZXIgdXNlcm5hbWVcbiAgICpcbiAgICogQGRlZmF1bHQgYWRtaW5cbiAgICovXG4gIHJlYWRvbmx5IG1hc3RlclVzZXJOYW1lPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBlbmFibGUgdGhlIEFtYXpvbiBSRFMgcHJveHlcbiAgICpcbiAgICogQGRlZmF1bHQgdHJ1ZVxuICAgKi9cbiAgcmVhZG9ubHkgcmRzUHJveHk/OiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBBZGRpdGlvbmFsIFJEUyBQcm94eSBPcHRpb25zXG4gICAqL1xuICByZWFkb25seSByZHNQcm94eU9wdGlvbnM/OiByZHMuRGF0YWJhc2VQcm94eU9wdGlvbnM7XG5cbiAgLyoqXG4gICAqIERlZmluZSBjbHVzdGVyIG9wdGlvbnNcbiAgICovXG4gIHJlYWRvbmx5IGRhdGFiYXNlT3B0aW9uczogcmRzLkRhdGFiYXNlQ2x1c3RlclByb3BzO1xufVxuXG5leHBvcnQgY2xhc3MgRGF0YWJhc2VDbHVzdGVyIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcmVhZG9ubHkgcmRzUHJveHk/OiByZHMuRGF0YWJhc2VQcm94eTtcbiAgcmVhZG9ubHkgbWFzdGVyVXNlcjogc3RyaW5nO1xuICByZWFkb25seSBtYXN0ZXJQYXNzd29yZDogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcbiAgcmVhZG9ubHkgZGJDb25uZWN0aW9uR3JvdXA6IElTZWN1cml0eUdyb3VwO1xuICByZWFkb25seSBkYkNsdXN0ZXI6IElEYXRhYmFzZUNsdXN0ZXI7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IERhdGFiYXNlUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgdGhpcy5tYXN0ZXJVc2VyID0gcHJvcHMubWFzdGVyVXNlck5hbWUgPz8gJ2FkbWluJztcblxuICAgIC8vIGdlbmVyYXRlIGFuZCBzdG9yZSBwYXNzd29yZCBmb3IgbWFzdGVyVXNlciBpbiB0aGUgc2VjcmV0cyBtYW5hZ2VyXG4gICAgY29uc3QgbWFzdGVyVXNlclNlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0RiTWFzdGVyU2VjcmV0Jywge1xuICAgICAgc2VjcmV0TmFtZTogYCR7U3RhY2sub2YodGhpcykuc3RhY2tOYW1lfS1EYk1hc3RlclNlY3JldGAsXG4gICAgICBnZW5lcmF0ZVNlY3JldFN0cmluZzoge1xuICAgICAgICBzZWNyZXRTdHJpbmdUZW1wbGF0ZTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHVzZXJuYW1lOiB0aGlzLm1hc3RlclVzZXIsXG4gICAgICAgIH0pLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogMTIsXG4gICAgICAgIGV4Y2x1ZGVQdW5jdHVhdGlvbjogdHJ1ZSxcbiAgICAgICAgaW5jbHVkZVNwYWNlOiBmYWxzZSxcbiAgICAgICAgZ2VuZXJhdGVTdHJpbmdLZXk6ICdwYXNzd29yZCcsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5tYXN0ZXJQYXNzd29yZCA9IG1hc3RlclVzZXJTZWNyZXQ7XG5cbiAgICBjb25zdCBkYkNvbm5lY3Rpb25Hcm91cCA9IHRoaXMuZGJDb25uZWN0aW9uR3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0RCIFNlY3VyaXR5IEdyb3VwJywge1xuICAgICAgdnBjOiBwcm9wcy5kYXRhYmFzZU9wdGlvbnMuaW5zdGFuY2VQcm9wcy52cGMsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGRiQ2x1c3RlciA9IHRoaXMuZGJDbHVzdGVyID0gbmV3IHJkcy5EYXRhYmFzZUNsdXN0ZXIodGhpcywgJ0RCQ2x1c3RlcicsIHtcbiAgICAgIC4uLnByb3BzLmRhdGFiYXNlT3B0aW9ucyxcbiAgICAgIGluc3RhbmNlUHJvcHM6IHtcbiAgICAgICAgLi4ucHJvcHMuZGF0YWJhc2VPcHRpb25zLmluc3RhbmNlUHJvcHMsXG4gICAgICAgIHNlY3VyaXR5R3JvdXBzOiBbZGJDb25uZWN0aW9uR3JvdXBdLFxuICAgICAgfSxcbiAgICAgIGNyZWRlbnRpYWxzOiByZHMuQ3JlZGVudGlhbHMuZnJvbVNlY3JldChtYXN0ZXJVc2VyU2VjcmV0KSxcbiAgICB9KTtcblxuICAgIC8vIFdvcmthcm91bmQgZm9yIGJ1ZyB3aGVyZSBUYXJnZXRHcm91cE5hbWUgaXMgbm90IHNldCBidXQgcmVxdWlyZWRcbiAgICBsZXQgY2ZuRGJJbnN0YW5jZSA9IGRiQ2x1c3Rlci5ub2RlLmNoaWxkcmVuLmZpbmQoKGNoaWxkOiBhbnkpID0+IHtcbiAgICAgIHJldHVybiBjaGlsZCBpbnN0YW5jZW9mIHJkcy5DZm5EQkluc3RhbmNlO1xuICAgIH0pIGFzIHJkcy5DZm5EQkluc3RhbmNlO1xuXG4gICAgLy8gZW5hYmxlIHRoZSBSRFMgcHJveHkgYnkgZGVmYXVsdFxuICAgIGlmIChwcm9wcy5yZHNQcm94eSAhPT0gZmFsc2UpIHtcbiAgICAgIC8vIGNyZWF0ZSBpYW0gcm9sZSBmb3IgUkRTIHByb3h5XG4gICAgICBjb25zdCByZHNQcm94eVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1Jkc1Byb3h5Um9sZScsIHtcbiAgICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ3Jkcy5hbWF6b25hd3MuY29tJyksXG4gICAgICB9KTtcbiAgICAgIC8vIHNlZTogaHR0cHM6Ly9hd3MuYW1hem9uLmNvbS90dy9ibG9ncy9jb21wdXRlL3VzaW5nLWFtYXpvbi1yZHMtcHJveHktd2l0aC1hd3MtbGFtYmRhL1xuICAgICAgcmRzUHJveHlSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdzZWNyZXRzbWFuYWdlcjpHZXRSZXNvdXJjZVBvbGljeScsXG4gICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkdldFNlY3JldFZhbHVlJyxcbiAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6RGVzY3JpYmVTZWNyZXQnLFxuICAgICAgICAgICdzZWNyZXRzbWFuYWdlcjpMaXN0U2VjcmV0VmVyc2lvbklkcycsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW21hc3RlclVzZXJTZWNyZXQuc2VjcmV0QXJuXSxcbiAgICAgIH0pKTtcblxuICAgICAgY29uc3QgcHJveHlPcHRpb25zOiByZHMuRGF0YWJhc2VQcm94eU9wdGlvbnMgPSB7XG4gICAgICAgIC4uLnByb3BzLnJkc1Byb3h5T3B0aW9ucyxcbiAgICAgICAgdnBjOiBwcm9wcy5kYXRhYmFzZU9wdGlvbnMuaW5zdGFuY2VQcm9wcy52cGMsXG4gICAgICAgIHNlY3JldHM6IFttYXN0ZXJVc2VyU2VjcmV0XSxcbiAgICAgICAgaWFtQXV0aDogdHJ1ZSxcbiAgICAgICAgZGJQcm94eU5hbWU6IGAke1N0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0tUkRTUHJveHlgLFxuICAgICAgICBzZWN1cml0eUdyb3VwczogW2RiQ29ubmVjdGlvbkdyb3VwXSxcbiAgICAgICAgcm9sZTogcmRzUHJveHlSb2xlLFxuICAgICAgfTtcblxuICAgICAgLy8gY3JlYXRlIHRoZSBSRFMgcHJveHlcbiAgICAgIHRoaXMucmRzUHJveHkgPSBkYkNsdXN0ZXIuYWRkUHJveHkoJ1JEU1Byb3h5JywgcHJveHlPcHRpb25zKTtcbiAgICAgIC8vIGVuc3VyZSBEQiBpbnN0YW5jZSBpcyByZWFkeSBiZWZvcmUgY3JlYXRpbmcgdGhlIHByb3h5XG4gICAgICB0aGlzLnJkc1Byb3h5Py5ub2RlLmFkZERlcGVuZGVuY3koY2ZuRGJJbnN0YW5jZSk7XG4gICAgfVxuICB9XG59XG5cbi8qKlxuICogQ29uc3RydWN0IHByb3BlcnRpZXMgZm9yIGBTZXJ2ZXJsZXNzQXBpYFxuICovXG5leHBvcnQgaW50ZXJmYWNlIFNlcnZlcmxlc3NDb25zb2xlUHJvcHMge1xuICAvKipcbiAgICogcGF0aCB0byBjb25zb2xlIGJpbmFyeSByZWxhdGl2ZSB0byBsYW1iZGFDb2RlUGF0aFxuICAgKi9cbiAgcmVhZG9ubHkgaGFuZGxlcjogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBjdXN0b20gbGFtYmRhIGNvZGUgYXNzZXQgcGF0aFxuICAgKlxuICAgKiBAZGVmYXVsdCAtIERFRkFVTFRfTEFNQkRBX0FTU0VUX1BBVEhcbiAgICovXG4gIHJlYWRvbmx5IGxhbWJkYUNvZGVQYXRoPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgYXJuIG9mIHRoZSBwaHAgbGF5ZXIgdG8gdXNlXG4gICAqL1xuICByZWFkb25seSBwaHBMYXllclZlcnNpb246IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIGFybiBvZiB0aGUgY29uc29sZSBsYXllciB0byB1c2VcbiAgICovXG4gIHJlYWRvbmx5IGNvbnNvbGVMYXllclZlcnNpb246IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIFZQQyBmb3IgdGhpcyBzdGFja1xuICAgKi9cbiAgcmVhZG9ubHkgdnBjPzogZWMyLklWcGM7XG5cbiAgLyoqXG4gICAqIERhdGFiYXNlIGNvbmZpZ3VyYXRpb25zXG4gICAqL1xuICByZWFkb25seSBkYXRhYmFzZUNvbmZpZz86IERhdGFiYXNlQ29uZmlnO1xuXG4gIC8qKlxuICAgKiBSRFMgUHJveHkgZm9yIHRoZSBMYW1iZGEgZnVuY3Rpb25cbiAgICpcbiAgICogQGRlZmF1bHQgLSBubyBkYiBwcm94eVxuICAgKi9cbiAgcmVhZG9ubHkgcmRzUHJveHk/OiByZHMuSURhdGFiYXNlUHJveHk7XG5cbiAgLyoqXG4gICAqIEFkZGl0aW9uYWwgbGFtYmRhIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgKi9cbiAgcmVhZG9ubHkgZW52aXJvbm1lbnQ/OiB7IFtrZXk6IHN0cmluZ10gOiBzdHJpbmcgfTtcbn1cblxuLyoqXG4gKiBVc2UgYFNlcnZlcmxlc3NDb25zb2xlYCB0byBjcmVhdGUgdGhlIHNlcnZlcmxlc3MgY29uc29sZSByZXNvdXJjZVxuICovXG5leHBvcnQgY2xhc3MgU2VydmVybGVzc0NvbnNvbGUgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICByZWFkb25seSBoYW5kbGVyOiBsYW1iZGEuSUZ1bmN0aW9uO1xuICByZWFkb25seSB2cGM/OiBlYzIuSVZwYztcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU2VydmVybGVzc0NvbnNvbGVQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCBERUZBVUxUX0xBTUJEQV9BU1NFVF9QQVRIID0gcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2NvbXBvc2VyL2xhcmF2ZWw1OC1icmVmJyk7XG4gICAgY29uc3QgREVGQVVMVF9EQl9NQVNURVJfVVNFUiA9ICdhZG1pbic7XG5cbiAgICB0aGlzLnZwYyA9IHByb3BzLnZwYztcblxuICAgIHRoaXMuaGFuZGxlciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ2hhbmRsZXInLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QUk9WSURFRF9BTDIsXG4gICAgICBoYW5kbGVyOiBwcm9wcy5oYW5kbGVyLFxuICAgICAgbGF5ZXJzOiBbXG4gICAgICAgIGxhbWJkYS5MYXllclZlcnNpb24uZnJvbUxheWVyVmVyc2lvbkFybih0aGlzLCAnUEhQTGF5ZXInLCBwcm9wcy5waHBMYXllclZlcnNpb24pLFxuICAgICAgICBsYW1iZGEuTGF5ZXJWZXJzaW9uLmZyb21MYXllclZlcnNpb25Bcm4odGhpcywgJ0NvbnNvbGVMYXllcicsIHByb3BzLmNvbnNvbGVMYXllclZlcnNpb24pLFxuICAgICAgXSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwcm9wcz8ubGFtYmRhQ29kZVBhdGggPz8gREVGQVVMVF9MQU1CREFfQVNTRVRfUEFUSCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBBUFBfU1RPUkFHRTogJy90bXAnLFxuICAgICAgICBEQl9XUklURVI6IHByb3BzLmRhdGFiYXNlQ29uZmlnPy53cml0ZXJFbmRwb2ludCA/PyAnJyxcbiAgICAgICAgREJfUkVBREVSOiBwcm9wcy5kYXRhYmFzZUNvbmZpZz8ucmVhZGVyRW5kcG9pbnQgPz8gcHJvcHMuZGF0YWJhc2VDb25maWc/LndyaXRlckVuZHBvaW50ID8/ICcnLFxuICAgICAgICBEQl9VU0VSOiBwcm9wcy5kYXRhYmFzZUNvbmZpZz8ubWFzdGVyVXNlck5hbWUgPz8gREVGQVVMVF9EQl9NQVNURVJfVVNFUixcbiAgICAgICAgLi4ucHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygxMjApLFxuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgfSk7XG5cbiAgICAvLyBhbGxvdyBsYW1iZGEgZXhlY3V0aW9uIHJvbGUgdG8gY29ubmVjdCB0byBSRFMgcHJveHlcbiAgICBpZiAocHJvcHMucmRzUHJveHkpIHtcbiAgICAgIHRoaXMuaGFuZGxlci5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbJ3Jkcy1kYjpjb25uZWN0J10sXG4gICAgICAgIHJlc291cmNlczogW3Byb3BzLnJkc1Byb3h5LmRiUHJveHlBcm5dLFxuICAgICAgfSkpO1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIENvbnN0cnVjdCBwcm9wZXJ0aWVzIGZvciBgU2VydmVybGVzc0xhcmF2ZWxgXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2VydmVybGVzc0xhcmF2ZWxDb25zb2xlUHJvcHMge1xuICAvKipcbiAgICogcGF0aCB0byBjb25zb2xlIGJpbmFyeSByZWxhdGl2ZSB0byBsYW1iZGFDb2RlUGF0aFxuICAgKiBAZGVmYXVsdCAtIGFydGlzYW5cbiAgICovXG4gIHJlYWRvbmx5IGhhbmRsZXI/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIGN1c3RvbSBsYW1iZGEgY29kZSBhc3NldCBwYXRoXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gREVGQVVMVF9MQU1CREFfQVNTRVRfUEFUSFxuICAgKi9cbiAgcmVhZG9ubHkgbGFtYmRhQ29kZVBhdGg/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBhcm4gb2YgdGhlIHBocCBsYXllciB0byB1c2VcbiAgICovXG4gIHJlYWRvbmx5IHBocExheWVyVmVyc2lvbjogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgYXJuIG9mIHRoZSBjb25zb2xlIGxheWVyIHRvIHVzZVxuICAgKi9cbiAgcmVhZG9ubHkgY29uc29sZUxheWVyVmVyc2lvbjogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgVlBDIGZvciB0aGlzIHN0YWNrXG4gICAqL1xuICByZWFkb25seSB2cGM/OiBlYzIuSVZwYztcblxuICAvKipcbiAgICogRGF0YWJhc2UgY29uZmlndXJhdGlvbnNcbiAgICovXG4gIHJlYWRvbmx5IGRhdGFiYXNlQ29uZmlnPzogRGF0YWJhc2VDb25maWc7XG5cbiAgLyoqXG4gICAqIFJEUyBQcm94eSBmb3IgdGhlIExhbWJkYSBmdW5jdGlvblxuICAgKlxuICAgKiBAZGVmYXVsdCAtIG5vIGRiIHByb3h5XG4gICAqL1xuICByZWFkb25seSByZHNQcm94eT86IHJkcy5JRGF0YWJhc2VQcm94eTtcblxuICAvKipcbiAgICogQWRkaXRpb25hbCBsYW1iZGEgZW52aXJvbm1lbnQgdmFyaWFibGVzXG4gICAqL1xuICByZWFkb25seSBlbnZpcm9ubWVudD86IHsgW2tleTogc3RyaW5nXSA6IHN0cmluZyB9O1xufVxuXG5leHBvcnQgY2xhc3MgU2VydmVybGVzc0xhcmF2ZWxDb25zb2xlIGV4dGVuZHMgU2VydmVybGVzc0NvbnNvbGUge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU2VydmVybGVzc0xhcmF2ZWxDb25zb2xlUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHtcbiAgICAgIC4uLnByb3BzLFxuICAgICAgaGFuZGxlcjogcHJvcHMuaGFuZGxlciA/PyAnYXJ0aXNhbicsXG4gICAgfSk7XG4gIH1cbn0iXX0=