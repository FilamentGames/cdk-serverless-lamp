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
        const dbConnectionGroup = new aws_cdk_lib_1.aws_ec2.SecurityGroup(this, 'DB Security Group', {
            vpc: props.databaseOptions.instanceProps.vpc,
            allowAllOutbound: false,
        });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFDQSw2QkFBNkI7QUFDN0IsOERBQThEO0FBQzlELHNHQUFxRjtBQUNyRiw2Q0FPcUI7QUFDckIsMkNBQXVDO0FBeUV2Qzs7R0FFRztBQUNILE1BQWEsYUFBYyxTQUFRLHNCQUFTO0lBSzFDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBeUI7UUFDakUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLHlCQUF5QixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLDRCQUE0QixDQUFDLENBQUM7UUFDckYsTUFBTSxzQkFBc0IsR0FBRyxPQUFPLENBQUM7UUFFdkMsSUFBSSxDQUFDLEdBQUcsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDO1FBRXJCLElBQUksQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQU8sSUFBSSxJQUFJLHdCQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUU7WUFDbkUsT0FBTyxFQUFFLHdCQUFNLENBQUMsT0FBTyxDQUFDLFlBQVk7WUFDcEMsT0FBTyxFQUFFLGtCQUFrQjtZQUMzQixNQUFNLEVBQUU7Z0JBQ04sd0JBQU0sQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsZ0JBQWdCLENBQUM7YUFDdEY7WUFDRCxJQUFJLEVBQUUsd0JBQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxjQUFjLElBQUkseUJBQXlCLENBQUM7WUFDL0UsV0FBVyxFQUFFO2dCQUNYLFdBQVcsRUFBRSxNQUFNO2dCQUNuQixTQUFTLEVBQUUsS0FBSyxDQUFDLGNBQWMsRUFBRSxjQUFjLElBQUksRUFBRTtnQkFDckQsU0FBUyxFQUFFLEtBQUssQ0FBQyxjQUFjLEVBQUUs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Q1gsV0FBVyxFQUFFLE1BQU07Z0JBQ25CLFNBQVMsRUFBRSxLQUFLLENBQUMsY0FBYyxFQUFFLGNBQWMsSUFBSSxFQUFFO2dCQUNyRCxTQUFTLEVBQUUsS0FBSyxDQUFDLGNBQWMsRUFBRSxjQUFjLElBQUksS0FBSyxDQUFDLGNBQWMsRUFBRSxjQUFjLElBQUksRUFBRTtnQkFDN0YsT0FBTyxFQUFFLEtBQUssQ0FBQyxjQUFjLEVBQUUsY0FBYyxJQUFJLHNCQUFzQjtnQkFDdkUsR0FBRyxLQUFLLENBQUMsV0FBVzthQUNyQjtZQUNELE9BQU8sRUFBRSxzQkFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUM7WUFDOUIsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO1NBQ2YsQ0FBQyxDQUFDO1FBRUgsc0RBQXNEO1FBQ3RELElBQUksS0FBSyxDQUFDLFFBQVEsRUFBRTtZQUNsQixJQUFJLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxJQUFJLHFCQUFHLENBQUMsZUFBZSxDQUFDO2dCQUNuRCxPQUFPLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQztnQkFDM0IsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUM7YUFDdkMsQ0FBQyxDQUFDLENBQUM7U0FDTDtJQUNILENBQUM7O0FBdENILDhDQXVDQzs7O0FBb0RELE1BQWEsd0JBQXlCLFNBQVEsaUJBQWlCO0lBQzdELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBb0M7UUFDNUUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUU7WUFDZixHQUFHLEtBQUs7WUFDUixPQUFPLEVBQUUsS0FBSyxDQUFDLE9BQU8sSUFBSSxTQUFTO1NBQ3BDLENBQUMsQ0FBQztJQUNMLENBQUM7O0FBTkgsNERBT0MiLCJzb3VyY2VzQ29udGVudCI6WyJcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ0Bhd3MtY2RrL2F3cy1hcGlnYXRld2F5djItYWxwaGEnO1xuaW1wb3J0IHsgSHR0cExhbWJkYUludGVncmF0aW9uIH0gZnJvbSAnQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXl2Mi1pbnRlZ3JhdGlvbnMtYWxwaGEnO1xuaW1wb3J0IHtcbiAgU3RhY2ssIENmbk91dHB1dCwgRHVyYXRpb24sXG4gIGF3c19lYzIgYXMgZWMyLFxuICBhd3NfaWFtIGFzIGlhbSxcbiAgYXdzX2xhbWJkYSBhcyBsYW1iZGEsXG4gIGF3c19yZHMgYXMgcmRzLFxuICBhd3Nfc2VjcmV0c21hbmFnZXIgYXMgc2VjcmV0c21hbmFnZXIsXG59IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5cbmV4cG9ydCBpbnRlcmZhY2UgRGF0YWJhc2VDb25maWcge1xuICAvKipcbiAgICogVGhlIERCIHdyaXRlciBlbmRwb2ludFxuICAgKi9cbiAgcmVhZG9ubHkgd3JpdGVyRW5kcG9pbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIERCIHJlYWRlciBlbmRwb2ludFxuICAgKi9cbiAgcmVhZG9ubHkgcmVhZGVyRW5kcG9pbnQ/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBEQiBtYXN0ZXIgdXNlcm5hbWVcbiAgICovXG4gIHJlYWRvbmx5IG1hc3RlclVzZXJOYW1lPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgREIgbWFzdGVyIHBhc3N3b3JkIHNlY3JldFxuICAgKi9cbiAgcmVhZG9ubHkgbWFzdGVyVXNlclBhc3N3b3JkU2VjcmV0Pzogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcbn1cblxuLyoqXG4gKiBDb25zdHJ1Y3QgcHJvcGVydGllcyBmb3IgYFNlcnZlcmxlc3NBcGlgXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2VydmVybGVzc0FwaVByb3BzIHtcbiAgLyoqXG4gICAqIGN1c3RvbSBsYW1iZGEgZnVuY3Rpb24gZm9yIHRoZSBBUElcbiAgICpcbiAgICogQGRlZmF1bHQgLSBBIExhbWJkYSBmdW5jdGlvbiB3aXRoIExhdmF2ZWwgYW5kIEJyZWYgc3VwcG9ydCB3aWxsIGJlIGNyZWF0ZWRcbiAgICovXG4gIHJlYWRvbmx5IGhhbmRsZXI/OiBsYW1iZGEuSUZ1bmN0aW9uO1xuXG4gIC8qKlxuICAgKiBjdXN0b20gbGFtYmRhIGNvZGUgYXNzZXQgcGF0aFxuICAgKlxuICAgKiBAZGVmYXVsdCAtIERFRkFVTFRfTEFNQkRBX0FTU0VUX1BBVEhcbiAgICovXG4gIHJlYWRvbmx5IGxhbWJkYUNvZGVQYXRoPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBBV1MgTGFtYmRhIGxheWVyIHZlcnNpb24gZnJvbSB0aGUgQnJlZiBydW50aW1lLlxuICAgKiBlLmcuIGFybjphd3M6bGFtYmRhOnVzLXdlc3QtMToyMDk0OTc0MDA2OTg6bGF5ZXI6cGhwLTc0LWZwbToxMlxuICAgKiBjaGVjayB0aGUgbGF0ZXN0IHJ1bnRpbWUgdmVyaW9uIGFybiBhdCBodHRwczovL2JyZWYuc2gvZG9jcy9ydW50aW1lcy9cbiAgICovXG4gIHJlYWRvbmx5IGJyZWZMYXllclZlcnNpb246IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIFZQQyBmb3IgdGhpcyBzdGFja1xuICAgKi9cbiAgcmVhZG9ubHkgdnBjPzogZWMyLklWcGM7XG5cbiAgLyoqXG4gICAqIERhdGFiYXNlIGNvbmZpZ3VyYXRpb25zXG4gICAqL1xuICByZWFkb25seSBkYXRhYmFzZUNvbmZpZz86IERhdGFiYXNlQ29uZmlnO1xuXG4gIC8qKlxuICAgKiBSRFMgUHJveHkgZm9yIHRoZSBMYW1iZGEgZnVuY3Rpb25cbiAgICpcbiAgICogQGRlZmF1bHQgLSBubyBkYiBwcm94eVxuICAgKi9cbiAgcmVhZG9ubHkgcmRzUHJveHk/OiByZHMuSURhdGFiYXNlUHJveHk7XG5cbiAgLyoqXG4gICAqIEFkZGl0aW9uYWwgYXBwIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgKi9cbiAgcmVhZG9ubHkgZW52aXJvbm1lbnQ/OiB7W2tleTpzdHJpbmddOiBzdHJpbmd9O1xufVxuXG4vKipcbiAqIFVzZSBgU2VydmVybGVzc0FwaWAgdG8gY3JlYXRlIHRoZSBzZXJ2ZXJsZXNzIEFQSSByZXNvdXJjZVxuICovXG5leHBvcnQgY2xhc3MgU2VydmVybGVzc0FwaSBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHJlYWRvbmx5IGhhbmRsZXI6IGxhbWJkYS5JRnVuY3Rpb247XG4gIHJlYWRvbmx5IHZwYz86IGVjMi5JVnBjO1xuICByZWFkb25seSBlbmRwb2ludDogYXBpZ2F0ZXdheS5IdHRwQXBpO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTZXJ2ZXJsZXNzQXBpUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3QgREVGQVVMVF9MQU1CREFfQVNTRVRfUEFUSCA9IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9jb21wb3Nlci9sYXJhdmVsNTgtYnJlZicpO1xuICAgIGNvbnN0IERFRkFVTFRfREJfTUFTVEVSX1VTRVIgPSAnYWRtaW4nO1xuXG4gICAgdGhpcy52cGMgPSBwcm9wcy52cGM7XG5cbiAgICB0aGlzLmhhbmRsZXIgPSBwcm9wcy5oYW5kbGVyID8/IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ2hhbmRsZXInLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QUk9WSURFRF9BTDIsXG4gICAgICBoYW5kbGVyOiAncHVibGljL2luZGV4LnBocCcsXG4gICAgICBsYXllcnM6IFtcbiAgICAgICAgbGFtYmRhLkxheWVyVmVyc2lvbi5mcm9tTGF5ZXJWZXJzaW9uQXJuKHRoaXMsICdCcmVmUEhQTGF5ZXInLCBwcm9wcy5icmVmTGF5ZXJWZXJzaW9uKSxcbiAgICAgIF0sXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocHJvcHM/LmxhbWJkYUNvZGVQYXRoID8/IERFRkFVTFRfTEFNQkRBX0FTU0VUX1BBVEgpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgQVBQX1NUT1JBR0U6ICcvdG1wJyxcbiAgICAgICAgREJfV1JJVEVSOiBwcm9wcy5kYXRhYmFzZUNvbmZpZz8ud3JpdGVyRW5kcG9pbnQgPz8gJycsXG4gICAgICAgIERCX1JFQURFUjogcHJvcHMuZGF0YWJhc2VDb25maWc/LnJlYWRlckVuZHBvaW50ID8/IHByb3BzLmRhdGFiYXNlQ29uZmlnPy53cml0ZXJFbmRwb2ludCA/PyAnJyxcbiAgICAgICAgREJfVVNFUjogcHJvcHMuZGF0YWJhc2VDb25maWc/Lm1hc3RlclVzZXJOYW1lID8/IERFRkFVTFRfREJfTUFTVEVSX1VTRVIsXG4gICAgICAgIC4uLnByb3BzLmVudmlyb25tZW50LFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMTIwKSxcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgIH0pO1xuXG4gICAgLy8gYWxsb3cgbGFtYmRhIGV4ZWN1dGlvbiByb2xlIHRvIGNvbm5lY3QgdG8gUkRTIHByb3h5XG4gICAgaWYgKHByb3BzLnJkc1Byb3h5KSB7XG4gICAgICB0aGlzLmhhbmRsZXIuYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogWydyZHMtZGI6Y29ubmVjdCddLFxuICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy5yZHNQcm94eS5kYlByb3h5QXJuXSxcbiAgICAgIH0pKTtcbiAgICB9XG5cbiAgICBjb25zdCBlbmRwb2ludCA9IHRoaXMuZW5kcG9pbnQgPSBuZXcgYXBpZ2F0ZXdheS5IdHRwQXBpKHRoaXMsICdhcGlzZXJ2aWNlJywge1xuICAgICAgZGVmYXVsdEludGVncmF0aW9uOiBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdsYW1iZGFIYW5kbGVyJywgdGhpcy5oYW5kbGVyKSxcbiAgICB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdFbmRwb2ludFVSTCcsIHsgdmFsdWU6IGVuZHBvaW50LnVybCEgfSk7XG4gIH1cbn1cblxuLyoqXG4gKiBDb25zdHJ1Y3QgcHJvcGVydGllcyBmb3IgYFNlcnZlcmxlc3NMYXJhdmVsYFxuICovXG5leHBvcnQgaW50ZXJmYWNlIFNlcnZlcmxlc3NMYXJhdmVsUHJvcHMgZXh0ZW5kcyBTZXJ2ZXJsZXNzQXBpUHJvcHMge1xuXG59XG5cbi8qKlxuICogVXNlIGBTZXJ2ZXJsZXNzTGFyYXZlbGAgdG8gY3JlYXRlIHRoZSBzZXJ2ZXJsZXNzIExhcmF2ZWwgcmVzb3VyY2VcbiAqL1xuZXhwb3J0IGNsYXNzIFNlcnZlcmxlc3NMYXJhdmVsIGV4dGVuZHMgU2VydmVybGVzc0FwaSB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTZXJ2ZXJsZXNzTGFyYXZlbFByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG4gIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBEYXRhYmFzZVByb3BzIHtcbiAgLyoqXG4gICAqIG1hc3RlciB1c2VybmFtZVxuICAgKlxuICAgKiBAZGVmYXVsdCBhZG1pblxuICAgKi9cbiAgcmVhZG9ubHkgbWFzdGVyVXNlck5hbWU/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIGVuYWJsZSB0aGUgQW1hem9uIFJEUyBwcm94eVxuICAgKlxuICAgKiBAZGVmYXVsdCB0cnVlXG4gICAqL1xuICByZWFkb25seSByZHNQcm94eT86IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIEFkZGl0aW9uYWwgUkRTIFByb3h5IE9wdGlvbnNcbiAgICovXG4gIHJlYWRvbmx5IHJkc1Byb3h5T3B0aW9ucz86IHJkcy5EYXRhYmFzZVByb3h5T3B0aW9ucztcblxuICAvKipcbiAgICogRGVmaW5lIGNsdXN0ZXIgb3B0aW9uc1xuICAgKi9cbiAgcmVhZG9ubHkgZGF0YWJhc2VPcHRpb25zOiByZHMuRGF0YWJhc2VDbHVzdGVyUHJvcHM7XG59XG5cbmV4cG9ydCBjbGFzcyBEYXRhYmFzZUNsdXN0ZXIgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICByZWFkb25seSByZHNQcm94eT86IHJkcy5EYXRhYmFzZVByb3h5O1xuICByZWFkb25seSBtYXN0ZXJVc2VyOiBzdHJpbmc7XG4gIHJlYWRvbmx5IG1hc3RlclBhc3N3b3JkOiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBEYXRhYmFzZVByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIHRoaXMubWFzdGVyVXNlciA9IHByb3BzLm1hc3RlclVzZXJOYW1lID8/ICdhZG1pbic7XG5cbiAgICAvLyBnZW5lcmF0ZSBhbmQgc3RvcmUgcGFzc3dvcmQgZm9yIG1hc3RlclVzZXIgaW4gdGhlIHNlY3JldHMgbWFuYWdlclxuICAgIGNvbnN0IG1hc3RlclVzZXJTZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdEYk1hc3RlclNlY3JldCcsIHtcbiAgICAgIHNlY3JldE5hbWU6IGAke1N0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0tRGJNYXN0ZXJTZWNyZXRgLFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgc2VjcmV0U3RyaW5nVGVtcGxhdGU6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICB1c2VybmFtZTogdGhpcy5tYXN0ZXJVc2VyLFxuICAgICAgICB9KSxcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDEyLFxuICAgICAgICBleGNsdWRlUHVuY3R1YXRpb246IHRydWUsXG4gICAgICAgIGluY2x1ZGVTcGFjZTogZmFsc2UsXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiAncGFzc3dvcmQnLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMubWFzdGVyUGFzc3dvcmQgPSBtYXN0ZXJVc2VyU2VjcmV0O1xuXG4gICAgY29uc3QgZGJDb25uZWN0aW9uR3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0RCIFNlY3VyaXR5IEdyb3VwJywge1xuICAgICAgdnBjOiBwcm9wcy5kYXRhYmFzZU9wdGlvbnMuaW5zdGFuY2VQcm9wcy52cGMsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGRiQ2x1c3RlciA9IG5ldyByZHMuRGF0YWJhc2VDbHVzdGVyKHRoaXMsICdEQkNsdXN0ZXInLCB7XG4gICAgICAuLi5wcm9wcy5kYXRhYmFzZU9wdGlvbnMsXG4gICAgICBpbnN0YW5jZVByb3BzOiB7XG4gICAgICAgIC4uLnByb3BzLmRhdGFiYXNlT3B0aW9ucy5pbnN0YW5jZVByb3BzLFxuICAgICAgICBzZWN1cml0eUdyb3VwczogW2RiQ29ubmVjdGlvbkdyb3VwXSxcbiAgICAgIH0sXG4gICAgICBjcmVkZW50aWFsczogcmRzLkNyZWRlbnRpYWxzLmZyb21TZWNyZXQobWFzdGVyVXNlclNlY3JldCksXG4gICAgfSk7XG5cbiAgICAvLyBXb3JrYXJvdW5kIGZvciBidWcgd2hlcmUgVGFyZ2V0R3JvdXBOYW1lIGlzIG5vdCBzZXQgYnV0IHJlcXVpcmVkXG4gICAgbGV0IGNmbkRiSW5zdGFuY2UgPSBkYkNsdXN0ZXIubm9kZS5jaGlsZHJlbi5maW5kKChjaGlsZDogYW55KSA9PiB7XG4gICAgICByZXR1cm4gY2hpbGQgaW5zdGFuY2VvZiByZHMuQ2ZuREJJbnN0YW5jZTtcbiAgICB9KSBhcyByZHMuQ2ZuREJJbnN0YW5jZTtcblxuICAgIC8vIGVuYWJsZSB0aGUgUkRTIHByb3h5IGJ5IGRlZmF1bHRcbiAgICBpZiAocHJvcHMucmRzUHJveHkgIT09IGZhbHNlKSB7XG4gICAgICAvLyBjcmVhdGUgaWFtIHJvbGUgZm9yIFJEUyBwcm94eVxuICAgICAgY29uc3QgcmRzUHJveHlSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdSZHNQcm94eVJvbGUnLCB7XG4gICAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdyZHMuYW1hem9uYXdzLmNvbScpLFxuICAgICAgfSk7XG4gICAgICAvLyBzZWU6IGh0dHBzOi8vYXdzLmFtYXpvbi5jb20vdHcvYmxvZ3MvY29tcHV0ZS91c2luZy1hbWF6b24tcmRzLXByb3h5LXdpdGgtYXdzLWxhbWJkYS9cbiAgICAgIHJkc1Byb3h5Um9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6R2V0UmVzb3VyY2VQb2xpY3knLFxuICAgICAgICAgICdzZWNyZXRzbWFuYWdlcjpHZXRTZWNyZXRWYWx1ZScsXG4gICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkRlc2NyaWJlU2VjcmV0JyxcbiAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6TGlzdFNlY3JldFZlcnNpb25JZHMnLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFttYXN0ZXJVc2VyU2VjcmV0LnNlY3JldEFybl0sXG4gICAgICB9KSk7XG5cbiAgICAgIGNvbnN0IHByb3h5T3B0aW9uczogcmRzLkRhdGFiYXNlUHJveHlPcHRpb25zID0ge1xuICAgICAgICAuLi5wcm9wcy5yZHNQcm94eU9wdGlvbnMsXG4gICAgICAgIHZwYzogcHJvcHMuZGF0YWJhc2VPcHRpb25zLmluc3RhbmNlUHJvcHMudnBjLFxuICAgICAgICBzZWNyZXRzOiBbbWFzdGVyVXNlclNlY3JldF0sXG4gICAgICAgIGlhbUF1dGg6IHRydWUsXG4gICAgICAgIGRiUHJveHlOYW1lOiBgJHtTdGFjay5vZih0aGlzKS5zdGFja05hbWV9LVJEU1Byb3h5YCxcbiAgICAgICAgc2VjdXJpdHlHcm91cHM6IFtkYkNvbm5lY3Rpb25Hcm91cF0sXG4gICAgICAgIHJvbGU6IHJkc1Byb3h5Um9sZSxcbiAgICAgIH07XG5cbiAgICAgIC8vIGNyZWF0ZSB0aGUgUkRTIHByb3h5XG4gICAgICB0aGlzLnJkc1Byb3h5ID0gZGJDbHVzdGVyLmFkZFByb3h5KCdSRFNQcm94eScsIHByb3h5T3B0aW9ucyk7XG4gICAgICAvLyBlbnN1cmUgREIgaW5zdGFuY2UgaXMgcmVhZHkgYmVmb3JlIGNyZWF0aW5nIHRoZSBwcm94eVxuICAgICAgdGhpcy5yZHNQcm94eT8ubm9kZS5hZGREZXBlbmRlbmN5KGNmbkRiSW5zdGFuY2UpO1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIENvbnN0cnVjdCBwcm9wZXJ0aWVzIGZvciBgU2VydmVybGVzc0FwaWBcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTZXJ2ZXJsZXNzQ29uc29sZVByb3BzIHtcbiAgLyoqXG4gICAqIHBhdGggdG8gY29uc29sZSBiaW5hcnkgcmVsYXRpdmUgdG8gbGFtYmRhQ29kZVBhdGhcbiAgICovXG4gIHJlYWRvbmx5IGhhbmRsZXI6IHN0cmluZztcblxuICAvKipcbiAgICogY3VzdG9tIGxhbWJkYSBjb2RlIGFzc2V0IHBhdGhcbiAgICpcbiAgICogQGRlZmF1bHQgLSBERUZBVUxUX0xBTUJEQV9BU1NFVF9QQVRIXG4gICAqL1xuICByZWFkb25seSBsYW1iZGFDb2RlUGF0aD86IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIGFybiBvZiB0aGUgcGhwIGxheWVyIHRvIHVzZVxuICAgKi9cbiAgcmVhZG9ubHkgcGhwTGF5ZXJWZXJzaW9uOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBhcm4gb2YgdGhlIGNvbnNvbGUgbGF5ZXIgdG8gdXNlXG4gICAqL1xuICByZWFkb25seSBjb25zb2xlTGF5ZXJWZXJzaW9uOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBWUEMgZm9yIHRoaXMgc3RhY2tcbiAgICovXG4gIHJlYWRvbmx5IHZwYz86IGVjMi5JVnBjO1xuXG4gIC8qKlxuICAgKiBEYXRhYmFzZSBjb25maWd1cmF0aW9uc1xuICAgKi9cbiAgcmVhZG9ubHkgZGF0YWJhc2VDb25maWc/OiBEYXRhYmFzZUNvbmZpZztcblxuICAvKipcbiAgICogUkRTIFByb3h5IGZvciB0aGUgTGFtYmRhIGZ1bmN0aW9uXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gbm8gZGIgcHJveHlcbiAgICovXG4gIHJlYWRvbmx5IHJkc1Byb3h5PzogcmRzLklEYXRhYmFzZVByb3h5O1xuXG4gIC8qKlxuICAgKiBBZGRpdGlvbmFsIGxhbWJkYSBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICovXG4gIHJlYWRvbmx5IGVudmlyb25tZW50PzogeyBba2V5OiBzdHJpbmddIDogc3RyaW5nIH07XG59XG5cbi8qKlxuICogVXNlIGBTZXJ2ZXJsZXNzQ29uc29sZWAgdG8gY3JlYXRlIHRoZSBzZXJ2ZXJsZXNzIGNvbnNvbGUgcmVzb3VyY2VcbiAqL1xuZXhwb3J0IGNsYXNzIFNlcnZlcmxlc3NDb25zb2xlIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcmVhZG9ubHkgaGFuZGxlcjogbGFtYmRhLklGdW5jdGlvbjtcbiAgcmVhZG9ubHkgdnBjPzogZWMyLklWcGM7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFNlcnZlcmxlc3NDb25zb2xlUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3QgREVGQVVMVF9MQU1CREFfQVNTRVRfUEFUSCA9IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9jb21wb3Nlci9sYXJhdmVsNTgtYnJlZicpO1xuICAgIGNvbnN0IERFRkFVTFRfREJfTUFTVEVSX1VTRVIgPSAnYWRtaW4nO1xuXG4gICAgdGhpcy52cGMgPSBwcm9wcy52cGM7XG5cbiAgICB0aGlzLmhhbmRsZXIgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdoYW5kbGVyJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFJPVklERURfQUwyLFxuICAgICAgaGFuZGxlcjogcHJvcHMuaGFuZGxlcixcbiAgICAgIGxheWVyczogW1xuICAgICAgICBsYW1iZGEuTGF5ZXJWZXJzaW9uLmZyb21MYXllclZlcnNpb25Bcm4odGhpcywgJ1BIUExheWVyJywgcHJvcHMucGhwTGF5ZXJWZXJzaW9uKSxcbiAgICAgICAgbGFtYmRhLkxheWVyVmVyc2lvbi5mcm9tTGF5ZXJWZXJzaW9uQXJuKHRoaXMsICdDb25zb2xlTGF5ZXInLCBwcm9wcy5jb25zb2xlTGF5ZXJWZXJzaW9uKSxcbiAgICAgIF0sXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocHJvcHM/LmxhbWJkYUNvZGVQYXRoID8/IERFRkFVTFRfTEFNQkRBX0FTU0VUX1BBVEgpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgQVBQX1NUT1JBR0U6ICcvdG1wJyxcbiAgICAgICAgREJfV1JJVEVSOiBwcm9wcy5kYXRhYmFzZUNvbmZpZz8ud3JpdGVyRW5kcG9pbnQgPz8gJycsXG4gICAgICAgIERCX1JFQURFUjogcHJvcHMuZGF0YWJhc2VDb25maWc/LnJlYWRlckVuZHBvaW50ID8/IHByb3BzLmRhdGFiYXNlQ29uZmlnPy53cml0ZXJFbmRwb2ludCA/PyAnJyxcbiAgICAgICAgREJfVVNFUjogcHJvcHMuZGF0YWJhc2VDb25maWc/Lm1hc3RlclVzZXJOYW1lID8/IERFRkFVTFRfREJfTUFTVEVSX1VTRVIsXG4gICAgICAgIC4uLnByb3BzLmVudmlyb25tZW50LFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMTIwKSxcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgIH0pO1xuXG4gICAgLy8gYWxsb3cgbGFtYmRhIGV4ZWN1dGlvbiByb2xlIHRvIGNvbm5lY3QgdG8gUkRTIHByb3h5XG4gICAgaWYgKHByb3BzLnJkc1Byb3h5KSB7XG4gICAgICB0aGlzLmhhbmRsZXIuYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogWydyZHMtZGI6Y29ubmVjdCddLFxuICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy5yZHNQcm94eS5kYlByb3h5QXJuXSxcbiAgICAgIH0pKTtcbiAgICB9XG4gIH1cbn1cblxuLyoqXG4gKiBDb25zdHJ1Y3QgcHJvcGVydGllcyBmb3IgYFNlcnZlcmxlc3NMYXJhdmVsYFxuICovXG5leHBvcnQgaW50ZXJmYWNlIFNlcnZlcmxlc3NMYXJhdmVsQ29uc29sZVByb3BzIHtcbiAgLyoqXG4gICAqIHBhdGggdG8gY29uc29sZSBiaW5hcnkgcmVsYXRpdmUgdG8gbGFtYmRhQ29kZVBhdGhcbiAgICogQGRlZmF1bHQgLSBhcnRpc2FuXG4gICAqL1xuICByZWFkb25seSBoYW5kbGVyPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBjdXN0b20gbGFtYmRhIGNvZGUgYXNzZXQgcGF0aFxuICAgKlxuICAgKiBAZGVmYXVsdCAtIERFRkFVTFRfTEFNQkRBX0FTU0VUX1BBVEhcbiAgICovXG4gIHJlYWRvbmx5IGxhbWJkYUNvZGVQYXRoPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgYXJuIG9mIHRoZSBwaHAgbGF5ZXIgdG8gdXNlXG4gICAqL1xuICByZWFkb25seSBwaHBMYXllclZlcnNpb246IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIGFybiBvZiB0aGUgY29uc29sZSBsYXllciB0byB1c2VcbiAgICovXG4gIHJlYWRvbmx5IGNvbnNvbGVMYXllclZlcnNpb246IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIFZQQyBmb3IgdGhpcyBzdGFja1xuICAgKi9cbiAgcmVhZG9ubHkgdnBjPzogZWMyLklWcGM7XG5cbiAgLyoqXG4gICAqIERhdGFiYXNlIGNvbmZpZ3VyYXRpb25zXG4gICAqL1xuICByZWFkb25seSBkYXRhYmFzZUNvbmZpZz86IERhdGFiYXNlQ29uZmlnO1xuXG4gIC8qKlxuICAgKiBSRFMgUHJveHkgZm9yIHRoZSBMYW1iZGEgZnVuY3Rpb25cbiAgICpcbiAgICogQGRlZmF1bHQgLSBubyBkYiBwcm94eVxuICAgKi9cbiAgcmVhZG9ubHkgcmRzUHJveHk/OiByZHMuSURhdGFiYXNlUHJveHk7XG5cbiAgLyoqXG4gICAqIEFkZGl0aW9uYWwgbGFtYmRhIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgKi9cbiAgcmVhZG9ubHkgZW52aXJvbm1lbnQ/OiB7IFtrZXk6IHN0cmluZ10gOiBzdHJpbmcgfTtcbn1cblxuZXhwb3J0IGNsYXNzIFNlcnZlcmxlc3NMYXJhdmVsQ29uc29sZSBleHRlbmRzIFNlcnZlcmxlc3NDb25zb2xlIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFNlcnZlcmxlc3NMYXJhdmVsQ29uc29sZVByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCB7XG4gICAgICAuLi5wcm9wcyxcbiAgICAgIGhhbmRsZXI6IHByb3BzLmhhbmRsZXIgPz8gJ2FydGlzYW4nLFxuICAgIH0pO1xuICB9XG59Il19