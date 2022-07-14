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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFDQSw2QkFBNkI7QUFDN0IsOERBQThEO0FBQzlELHNHQUFxRjtBQUNyRiw2Q0FPcUI7QUFHckIsMkNBQXVDO0FBZ0Z2Qzs7R0FFRztBQUNILE1BQWEsYUFBYyxTQUFRLHNCQUFTO0lBSzFDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBeUI7UUFDakUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLHlCQUF5QixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLDRCQUE0QixDQUFDLENBQUM7UUFDckYsTUFBTSxzQkFBc0IsR0FBRyxPQUFPLENBQUM7UUFFdkMsSUFBSSxDQUFDLEdBQUcsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDO1FBRXJCLElBQUksQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQU8sSUFBSSxJQUFJLHdCQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUU7WUFDbkUsT0FBTyxFQUFFLHdCQUFNLENBQUMsT0FBTyxDQUFDLFlBQVk7WUFDcEMsT0FBTyxFQUFFLGtCQUFrQjtZQUMzQixNQUFNLEVBQUU7Z0JBQ04sd0JBQU0sQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsZ0JBQWdCLENBQUM7YUFDdEY7WUFDRCxJQUFJLEVBQUUsd0JBQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxjQUFjLElBQUkseUJBQXlCLENBQUM7WUFDL0UsV0FBVyxFQUFFO2dCQUNYLFdBQVcsRUFBRSxNQUFNO2dCQUNuQixTQUFTLEVBQUUsS0FBSyxDQUFDLGNBQWMsRUFBRSxjQUFjLElBQUksRUFBRTtnQkFDckQsU0FBUyxFQUFFLEtBQUssQ0FBQyxjQUFjLEVBQUUs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Q0FBQyxLQUFLLEVBQUUsY0FBYyxJQUFJLHlCQUF5QixDQUFDO1lBQy9FLFdBQVcsRUFBRTtnQkFDWCxXQUFXLEVBQUUsTUFBTTtnQkFDbkIsU0FBUyxFQUFFLEtBQUssQ0FBQyxjQUFjLEVBQUUsY0FBYyxJQUFJLEVBQUU7Z0JBQ3JELFNBQVMsRUFBRSxLQUFLLENBQUMsY0FBYyxFQUFFLGNBQWMsSUFBSSxLQUFLLENBQUMsY0FBYyxFQUFFLGNBQWMsSUFBSSxFQUFFO2dCQUM3RixPQUFPLEVBQUUsS0FBSyxDQUFDLGNBQWMsRUFBRSxjQUFjLElBQUksc0JBQXNCO2dCQUN2RSxHQUFHLEtBQUssQ0FBQyxXQUFXO2FBQ3JCO1lBQ0QsT0FBTyxFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQztZQUM5QixHQUFHLEVBQUUsS0FBSyxDQUFDLEdBQUc7U0FDZixDQUFDLENBQUM7UUFFSCxzREFBc0Q7UUFDdEQsSUFBSSxLQUFLLENBQUMsUUFBUSxFQUFFO1lBQ2xCLElBQUksQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLElBQUkscUJBQUcsQ0FBQyxlQUFlLENBQUM7Z0JBQ25ELE9BQU8sRUFBRSxDQUFDLGdCQUFnQixDQUFDO2dCQUMzQixTQUFTLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQzthQUN2QyxDQUFDLENBQUMsQ0FBQztTQUNMO0lBQ0gsQ0FBQzs7QUF0Q0gsOENBdUNDOzs7QUFvREQsTUFBYSx3QkFBeUIsU0FBUSxpQkFBaUI7SUFDN0QsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFvQztRQUM1RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRTtZQUNmLEdBQUcsS0FBSztZQUNSLE9BQU8sRUFBRSxLQUFLLENBQUMsT0FBTyxJQUFJLFNBQVM7U0FDcEMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQzs7QUFOSCw0REFPQyIsInNvdXJjZXNDb250ZW50IjpbIlxuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXl2Mi1hbHBoYSc7XG5pbXBvcnQgeyBIdHRwTGFtYmRhSW50ZWdyYXRpb24gfSBmcm9tICdAYXdzLWNkay9hd3MtYXBpZ2F0ZXdheXYyLWludGVncmF0aW9ucy1hbHBoYSc7XG5pbXBvcnQge1xuICBTdGFjaywgQ2ZuT3V0cHV0LCBEdXJhdGlvbixcbiAgYXdzX2VjMiBhcyBlYzIsXG4gIGF3c19pYW0gYXMgaWFtLFxuICBhd3NfbGFtYmRhIGFzIGxhbWJkYSxcbiAgYXdzX3JkcyBhcyByZHMsXG4gIGF3c19zZWNyZXRzbWFuYWdlciBhcyBzZWNyZXRzbWFuYWdlcixcbn0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgSVNlY3VyaXR5R3JvdXAgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCB7IElEYXRhYmFzZUNsdXN0ZXIgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtcmRzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5cbmV4cG9ydCBpbnRlcmZhY2UgRGF0YWJhc2VDb25maWcge1xuICAvKipcbiAgICogVGhlIERCIHdyaXRlciBlbmRwb2ludFxuICAgKi9cbiAgcmVhZG9ubHkgd3JpdGVyRW5kcG9pbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIERCIHJlYWRlciBlbmRwb2ludFxuICAgKi9cbiAgcmVhZG9ubHkgcmVhZGVyRW5kcG9pbnQ/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBEQiBtYXN0ZXIgdXNlcm5hbWVcbiAgICovXG4gIHJlYWRvbmx5IG1hc3RlclVzZXJOYW1lPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgREIgbWFzdGVyIHBhc3N3b3JkIHNlY3JldFxuICAgKi9cbiAgcmVhZG9ubHkgbWFzdGVyVXNlclBhc3N3b3JkU2VjcmV0Pzogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcbn1cblxuLyoqXG4gKiBDb25zdHJ1Y3QgcHJvcGVydGllcyBmb3IgYFNlcnZlcmxlc3NBcGlgXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2VydmVybGVzc0FwaVByb3BzIHtcbiAgLyoqXG4gICAqIGN1c3RvbSBsYW1iZGEgZnVuY3Rpb24gZm9yIHRoZSBBUElcbiAgICpcbiAgICogQGRlZmF1bHQgLSBBIExhbWJkYSBmdW5jdGlvbiB3aXRoIExhdmF2ZWwgYW5kIEJyZWYgc3VwcG9ydCB3aWxsIGJlIGNyZWF0ZWRcbiAgICovXG4gIHJlYWRvbmx5IGhhbmRsZXI/OiBsYW1iZGEuSUZ1bmN0aW9uO1xuXG4gIC8qKlxuICAgKiBjdXN0b20gbGFtYmRhIGNvZGUgYXNzZXQgcGF0aFxuICAgKlxuICAgKiBAZGVmYXVsdCAtIERFRkFVTFRfTEFNQkRBX0FTU0VUX1BBVEhcbiAgICovXG4gIHJlYWRvbmx5IGxhbWJkYUNvZGVQYXRoPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBBV1MgTGFtYmRhIGxheWVyIHZlcnNpb24gZnJvbSB0aGUgQnJlZiBydW50aW1lLlxuICAgKiBlLmcuIGFybjphd3M6bGFtYmRhOnVzLXdlc3QtMToyMDk0OTc0MDA2OTg6bGF5ZXI6cGhwLTc0LWZwbToxMlxuICAgKiBjaGVjayB0aGUgbGF0ZXN0IHJ1bnRpbWUgdmVyaW9uIGFybiBhdCBodHRwczovL2JyZWYuc2gvZG9jcy9ydW50aW1lcy9cbiAgICovXG4gIHJlYWRvbmx5IGJyZWZMYXllclZlcnNpb246IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIFZQQyBmb3IgdGhpcyBzdGFja1xuICAgKi9cbiAgcmVhZG9ubHkgdnBjPzogZWMyLklWcGM7XG5cbiAgLyoqXG4gICAqIERhdGFiYXNlIGNvbmZpZ3VyYXRpb25zXG4gICAqL1xuICByZWFkb25seSBkYXRhYmFzZUNvbmZpZz86IERhdGFiYXNlQ29uZmlnO1xuXG4gIC8qKlxuICAgKiBSRFMgUHJveHkgZm9yIHRoZSBMYW1iZGEgZnVuY3Rpb25cbiAgICpcbiAgICogQGRlZmF1bHQgLSBubyBkYiBwcm94eVxuICAgKi9cbiAgcmVhZG9ubHkgcmRzUHJveHk/OiByZHMuSURhdGFiYXNlUHJveHk7XG5cbiAgLyoqXG4gICAqIEFkZGl0aW9uYWwgYXBwIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgKi9cbiAgcmVhZG9ubHkgZW52aXJvbm1lbnQ/OiB7W2tleTpzdHJpbmddOiBzdHJpbmd9O1xuXG4gIC8qKlxuICAgKiBXaGV0aGVyIHRvIGRpc2FibGUgdGhlIGRlZmF1bHQgZXhlY3V0ZSBhcGkgZW5kcG9pbnQuXG4gICAqIFlvdSBjYW4gZW5hYmxlIHRoaXMgd2hlbiB5b3UgaGF2ZSBhIGN1c3RvbSBkb21haW4gbWFwcGVkLlxuICAgKiBAZGVmYXVsdCAtIGZhbHNlXG4gICAqL1xuICByZWFkb25seSBkaXNhYmxlRXhlY3V0ZUFwaUVuZHBvaW50PzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBVc2UgYFNlcnZlcmxlc3NBcGlgIHRvIGNyZWF0ZSB0aGUgc2VydmVybGVzcyBBUEkgcmVzb3VyY2VcbiAqL1xuZXhwb3J0IGNsYXNzIFNlcnZlcmxlc3NBcGkgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICByZWFkb25seSBoYW5kbGVyOiBsYW1iZGEuSUZ1bmN0aW9uO1xuICByZWFkb25seSB2cGM/OiBlYzIuSVZwYztcbiAgcmVhZG9ubHkgZW5kcG9pbnQ6IGFwaWdhdGV3YXkuSHR0cEFwaTtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU2VydmVybGVzc0FwaVByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IERFRkFVTFRfTEFNQkRBX0FTU0VUX1BBVEggPSBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vY29tcG9zZXIvbGFyYXZlbDU4LWJyZWYnKTtcbiAgICBjb25zdCBERUZBVUxUX0RCX01BU1RFUl9VU0VSID0gJ2FkbWluJztcblxuICAgIHRoaXMudnBjID0gcHJvcHMudnBjO1xuXG4gICAgdGhpcy5oYW5kbGVyID0gcHJvcHMuaGFuZGxlciA/PyBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdoYW5kbGVyJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFJPVklERURfQUwyLFxuICAgICAgaGFuZGxlcjogJ3B1YmxpYy9pbmRleC5waHAnLFxuICAgICAgbGF5ZXJzOiBbXG4gICAgICAgIGxhbWJkYS5MYXllclZlcnNpb24uZnJvbUxheWVyVmVyc2lvbkFybih0aGlzLCAnQnJlZlBIUExheWVyJywgcHJvcHMuYnJlZkxheWVyVmVyc2lvbiksXG4gICAgICBdLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHByb3BzPy5sYW1iZGFDb2RlUGF0aCA/PyBERUZBVUxUX0xBTUJEQV9BU1NFVF9QQVRIKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEFQUF9TVE9SQUdFOiAnL3RtcCcsXG4gICAgICAgIERCX1dSSVRFUjogcHJvcHMuZGF0YWJhc2VDb25maWc/LndyaXRlckVuZHBvaW50ID8/ICcnLFxuICAgICAgICBEQl9SRUFERVI6IHByb3BzLmRhdGFiYXNlQ29uZmlnPy5yZWFkZXJFbmRwb2ludCA/PyBwcm9wcy5kYXRhYmFzZUNvbmZpZz8ud3JpdGVyRW5kcG9pbnQgPz8gJycsXG4gICAgICAgIERCX1VTRVJOQU1FOiBwcm9wcy5kYXRhYmFzZUNvbmZpZz8ubWFzdGVyVXNlck5hbWUgPz8gREVGQVVMVF9EQl9NQVNURVJfVVNFUixcbiAgICAgICAgLi4ucHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygxMjApLFxuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgfSk7XG5cbiAgICAvLyBhbGxvdyBsYW1iZGEgZXhlY3V0aW9uIHJvbGUgdG8gY29ubmVjdCB0byBSRFMgcHJveHlcbiAgICBpZiAocHJvcHMucmRzUHJveHkpIHtcbiAgICAgIHRoaXMuaGFuZGxlci5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbJ3Jkcy1kYjpjb25uZWN0J10sXG4gICAgICAgIHJlc291cmNlczogW3Byb3BzLnJkc1Byb3h5LmRiUHJveHlBcm5dLFxuICAgICAgfSkpO1xuICAgIH1cblxuICAgIGNvbnN0IGVuZHBvaW50ID0gdGhpcy5lbmRwb2ludCA9IG5ldyBhcGlnYXRld2F5Lkh0dHBBcGkodGhpcywgJ2FwaXNlcnZpY2UnLCB7XG4gICAgICBkZWZhdWx0SW50ZWdyYXRpb246IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ2xhbWJkYUhhbmRsZXInLCB0aGlzLmhhbmRsZXIpLFxuICAgICAgZGlzYWJsZUV4ZWN1dGVBcGlFbmRwb2ludDogcHJvcHMuZGlzYWJsZUV4ZWN1dGVBcGlFbmRwb2ludCxcbiAgICB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdFbmRwb2ludFVSTCcsIHsgdmFsdWU6IGVuZHBvaW50LnVybCEgfSk7XG4gIH1cbn1cblxuLyoqXG4gKiBDb25zdHJ1Y3QgcHJvcGVydGllcyBmb3IgYFNlcnZlcmxlc3NMYXJhdmVsYFxuICovXG5leHBvcnQgaW50ZXJmYWNlIFNlcnZlcmxlc3NMYXJhdmVsUHJvcHMgZXh0ZW5kcyBTZXJ2ZXJsZXNzQXBpUHJvcHMge1xuXG59XG5cbi8qKlxuICogVXNlIGBTZXJ2ZXJsZXNzTGFyYXZlbGAgdG8gY3JlYXRlIHRoZSBzZXJ2ZXJsZXNzIExhcmF2ZWwgcmVzb3VyY2VcbiAqL1xuZXhwb3J0IGNsYXNzIFNlcnZlcmxlc3NMYXJhdmVsIGV4dGVuZHMgU2VydmVybGVzc0FwaSB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTZXJ2ZXJsZXNzTGFyYXZlbFByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG4gIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBEYXRhYmFzZVByb3BzIHtcbiAgLyoqXG4gICAqIG1hc3RlciB1c2VybmFtZVxuICAgKlxuICAgKiBAZGVmYXVsdCBhZG1pblxuICAgKi9cbiAgcmVhZG9ubHkgbWFzdGVyVXNlck5hbWU/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIGVuYWJsZSB0aGUgQW1hem9uIFJEUyBwcm94eVxuICAgKlxuICAgKiBAZGVmYXVsdCB0cnVlXG4gICAqL1xuICByZWFkb25seSByZHNQcm94eT86IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIEFkZGl0aW9uYWwgUkRTIFByb3h5IE9wdGlvbnNcbiAgICovXG4gIHJlYWRvbmx5IHJkc1Byb3h5T3B0aW9ucz86IHJkcy5EYXRhYmFzZVByb3h5T3B0aW9ucztcblxuICAvKipcbiAgICogRGVmaW5lIGNsdXN0ZXIgb3B0aW9uc1xuICAgKi9cbiAgcmVhZG9ubHkgZGF0YWJhc2VPcHRpb25zOiByZHMuRGF0YWJhc2VDbHVzdGVyUHJvcHM7XG59XG5cbmV4cG9ydCBjbGFzcyBEYXRhYmFzZUNsdXN0ZXIgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICByZWFkb25seSByZHNQcm94eT86IHJkcy5EYXRhYmFzZVByb3h5O1xuICByZWFkb25seSBtYXN0ZXJVc2VyOiBzdHJpbmc7XG4gIHJlYWRvbmx5IG1hc3RlclBhc3N3b3JkOiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuICByZWFkb25seSBkYkNvbm5lY3Rpb25Hcm91cDogSVNlY3VyaXR5R3JvdXA7XG4gIHJlYWRvbmx5IGRiQ2x1c3RlcjogSURhdGFiYXNlQ2x1c3RlcjtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogRGF0YWJhc2VQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICB0aGlzLm1hc3RlclVzZXIgPSBwcm9wcy5tYXN0ZXJVc2VyTmFtZSA/PyAnYWRtaW4nO1xuXG4gICAgLy8gZ2VuZXJhdGUgYW5kIHN0b3JlIHBhc3N3b3JkIGZvciBtYXN0ZXJVc2VyIGluIHRoZSBzZWNyZXRzIG1hbmFnZXJcbiAgICBjb25zdCBtYXN0ZXJVc2VyU2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnRGJNYXN0ZXJTZWNyZXQnLCB7XG4gICAgICBzZWNyZXROYW1lOiBgJHtTdGFjay5vZih0aGlzKS5zdGFja05hbWV9LURiTWFzdGVyU2VjcmV0YCxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgdXNlcm5hbWU6IHRoaXMubWFzdGVyVXNlcixcbiAgICAgICAgfSksXG4gICAgICAgIHBhc3N3b3JkTGVuZ3RoOiAxMixcbiAgICAgICAgZXhjbHVkZVB1bmN0dWF0aW9uOiB0cnVlLFxuICAgICAgICBpbmNsdWRlU3BhY2U6IGZhbHNlLFxuICAgICAgICBnZW5lcmF0ZVN0cmluZ0tleTogJ3Bhc3N3b3JkJyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLm1hc3RlclBhc3N3b3JkID0gbWFzdGVyVXNlclNlY3JldDtcblxuICAgIGNvbnN0IGRiQ29ubmVjdGlvbkdyb3VwID0gdGhpcy5kYkNvbm5lY3Rpb25Hcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnREIgU2VjdXJpdHkgR3JvdXAnLCB7XG4gICAgICB2cGM6IHByb3BzLmRhdGFiYXNlT3B0aW9ucy5pbnN0YW5jZVByb3BzLnZwYyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZGJDbHVzdGVyID0gdGhpcy5kYkNsdXN0ZXIgPSBuZXcgcmRzLkRhdGFiYXNlQ2x1c3Rlcih0aGlzLCAnREJDbHVzdGVyJywge1xuICAgICAgLi4ucHJvcHMuZGF0YWJhc2VPcHRpb25zLFxuICAgICAgaW5zdGFuY2VQcm9wczoge1xuICAgICAgICAuLi5wcm9wcy5kYXRhYmFzZU9wdGlvbnMuaW5zdGFuY2VQcm9wcyxcbiAgICAgICAgc2VjdXJpdHlHcm91cHM6IFtkYkNvbm5lY3Rpb25Hcm91cF0sXG4gICAgICB9LFxuICAgICAgY3JlZGVudGlhbHM6IHJkcy5DcmVkZW50aWFscy5mcm9tU2VjcmV0KG1hc3RlclVzZXJTZWNyZXQpLFxuICAgIH0pO1xuXG4gICAgLy8gV29ya2Fyb3VuZCBmb3IgYnVnIHdoZXJlIFRhcmdldEdyb3VwTmFtZSBpcyBub3Qgc2V0IGJ1dCByZXF1aXJlZFxuICAgIGxldCBjZm5EYkluc3RhbmNlID0gZGJDbHVzdGVyLm5vZGUuY2hpbGRyZW4uZmluZCgoY2hpbGQ6IGFueSkgPT4ge1xuICAgICAgcmV0dXJuIGNoaWxkIGluc3RhbmNlb2YgcmRzLkNmbkRCSW5zdGFuY2U7XG4gICAgfSkgYXMgcmRzLkNmbkRCSW5zdGFuY2U7XG5cbiAgICAvLyBlbmFibGUgdGhlIFJEUyBwcm94eSBieSBkZWZhdWx0XG4gICAgaWYgKHByb3BzLnJkc1Byb3h5ICE9PSBmYWxzZSkge1xuICAgICAgLy8gY3JlYXRlIGlhbSByb2xlIGZvciBSRFMgcHJveHlcbiAgICAgIGNvbnN0IHJkc1Byb3h5Um9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnUmRzUHJveHlSb2xlJywge1xuICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgncmRzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIH0pO1xuICAgICAgLy8gc2VlOiBodHRwczovL2F3cy5hbWF6b24uY29tL3R3L2Jsb2dzL2NvbXB1dGUvdXNpbmctYW1hem9uLXJkcy1wcm94eS13aXRoLWF3cy1sYW1iZGEvXG4gICAgICByZHNQcm94eVJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkdldFJlc291cmNlUG9saWN5JyxcbiAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6R2V0U2VjcmV0VmFsdWUnLFxuICAgICAgICAgICdzZWNyZXRzbWFuYWdlcjpEZXNjcmliZVNlY3JldCcsXG4gICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkxpc3RTZWNyZXRWZXJzaW9uSWRzJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbbWFzdGVyVXNlclNlY3JldC5zZWNyZXRBcm5dLFxuICAgICAgfSkpO1xuXG4gICAgICBjb25zdCBwcm94eU9wdGlvbnM6IHJkcy5EYXRhYmFzZVByb3h5T3B0aW9ucyA9IHtcbiAgICAgICAgLi4ucHJvcHMucmRzUHJveHlPcHRpb25zLFxuICAgICAgICB2cGM6IHByb3BzLmRhdGFiYXNlT3B0aW9ucy5pbnN0YW5jZVByb3BzLnZwYyxcbiAgICAgICAgc2VjcmV0czogW21hc3RlclVzZXJTZWNyZXRdLFxuICAgICAgICBkYlByb3h5TmFtZTogYCR7U3RhY2sub2YodGhpcykuc3RhY2tOYW1lfS1SRFNQcm94eWAsXG4gICAgICAgIHNlY3VyaXR5R3JvdXBzOiBbZGJDb25uZWN0aW9uR3JvdXBdLFxuICAgICAgICByb2xlOiByZHNQcm94eVJvbGUsXG4gICAgICB9O1xuXG4gICAgICAvLyBjcmVhdGUgdGhlIFJEUyBwcm94eVxuICAgICAgdGhpcy5yZHNQcm94eSA9IGRiQ2x1c3Rlci5hZGRQcm94eSgnUkRTUHJveHknLCBwcm94eU9wdGlvbnMpO1xuICAgICAgLy8gZW5zdXJlIERCIGluc3RhbmNlIGlzIHJlYWR5IGJlZm9yZSBjcmVhdGluZyB0aGUgcHJveHlcbiAgICAgIHRoaXMucmRzUHJveHk/Lm5vZGUuYWRkRGVwZW5kZW5jeShjZm5EYkluc3RhbmNlKTtcbiAgICB9XG4gIH1cbn1cblxuLyoqXG4gKiBDb25zdHJ1Y3QgcHJvcGVydGllcyBmb3IgYFNlcnZlcmxlc3NBcGlgXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2VydmVybGVzc0NvbnNvbGVQcm9wcyB7XG4gIC8qKlxuICAgKiBwYXRoIHRvIGNvbnNvbGUgYmluYXJ5IHJlbGF0aXZlIHRvIGxhbWJkYUNvZGVQYXRoXG4gICAqL1xuICByZWFkb25seSBoYW5kbGVyOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIGN1c3RvbSBsYW1iZGEgY29kZSBhc3NldCBwYXRoXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gREVGQVVMVF9MQU1CREFfQVNTRVRfUEFUSFxuICAgKi9cbiAgcmVhZG9ubHkgbGFtYmRhQ29kZVBhdGg/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBhcm4gb2YgdGhlIHBocCBsYXllciB0byB1c2VcbiAgICovXG4gIHJlYWRvbmx5IHBocExheWVyVmVyc2lvbjogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgYXJuIG9mIHRoZSBjb25zb2xlIGxheWVyIHRvIHVzZVxuICAgKi9cbiAgcmVhZG9ubHkgY29uc29sZUxheWVyVmVyc2lvbjogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgVlBDIGZvciB0aGlzIHN0YWNrXG4gICAqL1xuICByZWFkb25seSB2cGM/OiBlYzIuSVZwYztcblxuICAvKipcbiAgICogRGF0YWJhc2UgY29uZmlndXJhdGlvbnNcbiAgICovXG4gIHJlYWRvbmx5IGRhdGFiYXNlQ29uZmlnPzogRGF0YWJhc2VDb25maWc7XG5cbiAgLyoqXG4gICAqIFJEUyBQcm94eSBmb3IgdGhlIExhbWJkYSBmdW5jdGlvblxuICAgKlxuICAgKiBAZGVmYXVsdCAtIG5vIGRiIHByb3h5XG4gICAqL1xuICByZWFkb25seSByZHNQcm94eT86IHJkcy5JRGF0YWJhc2VQcm94eTtcblxuICAvKipcbiAgICogQWRkaXRpb25hbCBsYW1iZGEgZW52aXJvbm1lbnQgdmFyaWFibGVzXG4gICAqL1xuICByZWFkb25seSBlbnZpcm9ubWVudD86IHsgW2tleTogc3RyaW5nXSA6IHN0cmluZyB9O1xufVxuXG4vKipcbiAqIFVzZSBgU2VydmVybGVzc0NvbnNvbGVgIHRvIGNyZWF0ZSB0aGUgc2VydmVybGVzcyBjb25zb2xlIHJlc291cmNlXG4gKi9cbmV4cG9ydCBjbGFzcyBTZXJ2ZXJsZXNzQ29uc29sZSBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHJlYWRvbmx5IGhhbmRsZXI6IGxhbWJkYS5JRnVuY3Rpb247XG4gIHJlYWRvbmx5IHZwYz86IGVjMi5JVnBjO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTZXJ2ZXJsZXNzQ29uc29sZVByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IERFRkFVTFRfTEFNQkRBX0FTU0VUX1BBVEggPSBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vY29tcG9zZXIvbGFyYXZlbDU4LWJyZWYnKTtcbiAgICBjb25zdCBERUZBVUxUX0RCX01BU1RFUl9VU0VSID0gJ2FkbWluJztcblxuICAgIHRoaXMudnBjID0gcHJvcHMudnBjO1xuXG4gICAgdGhpcy5oYW5kbGVyID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnaGFuZGxlcicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBST1ZJREVEX0FMMixcbiAgICAgIGhhbmRsZXI6IHByb3BzLmhhbmRsZXIsXG4gICAgICBsYXllcnM6IFtcbiAgICAgICAgbGFtYmRhLkxheWVyVmVyc2lvbi5mcm9tTGF5ZXJWZXJzaW9uQXJuKHRoaXMsICdQSFBMYXllcicsIHByb3BzLnBocExheWVyVmVyc2lvbiksXG4gICAgICAgIGxhbWJkYS5MYXllclZlcnNpb24uZnJvbUxheWVyVmVyc2lvbkFybih0aGlzLCAnQ29uc29sZUxheWVyJywgcHJvcHMuY29uc29sZUxheWVyVmVyc2lvbiksXG4gICAgICBdLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHByb3BzPy5sYW1iZGFDb2RlUGF0aCA/PyBERUZBVUxUX0xBTUJEQV9BU1NFVF9QQVRIKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEFQUF9TVE9SQUdFOiAnL3RtcCcsXG4gICAgICAgIERCX1dSSVRFUjogcHJvcHMuZGF0YWJhc2VDb25maWc/LndyaXRlckVuZHBvaW50ID8/ICcnLFxuICAgICAgICBEQl9SRUFERVI6IHByb3BzLmRhdGFiYXNlQ29uZmlnPy5yZWFkZXJFbmRwb2ludCA/PyBwcm9wcy5kYXRhYmFzZUNvbmZpZz8ud3JpdGVyRW5kcG9pbnQgPz8gJycsXG4gICAgICAgIERCX1VTRVI6IHByb3BzLmRhdGFiYXNlQ29uZmlnPy5tYXN0ZXJVc2VyTmFtZSA/PyBERUZBVUxUX0RCX01BU1RFUl9VU0VSLFxuICAgICAgICAuLi5wcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDEyMCksXG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICB9KTtcblxuICAgIC8vIGFsbG93IGxhbWJkYSBleGVjdXRpb24gcm9sZSB0byBjb25uZWN0IHRvIFJEUyBwcm94eVxuICAgIGlmIChwcm9wcy5yZHNQcm94eSkge1xuICAgICAgdGhpcy5oYW5kbGVyLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFsncmRzLWRiOmNvbm5lY3QnXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbcHJvcHMucmRzUHJveHkuZGJQcm94eUFybl0sXG4gICAgICB9KSk7XG4gICAgfVxuICB9XG59XG5cbi8qKlxuICogQ29uc3RydWN0IHByb3BlcnRpZXMgZm9yIGBTZXJ2ZXJsZXNzTGFyYXZlbGBcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTZXJ2ZXJsZXNzTGFyYXZlbENvbnNvbGVQcm9wcyB7XG4gIC8qKlxuICAgKiBwYXRoIHRvIGNvbnNvbGUgYmluYXJ5IHJlbGF0aXZlIHRvIGxhbWJkYUNvZGVQYXRoXG4gICAqIEBkZWZhdWx0IC0gYXJ0aXNhblxuICAgKi9cbiAgcmVhZG9ubHkgaGFuZGxlcj86IHN0cmluZztcblxuICAvKipcbiAgICogY3VzdG9tIGxhbWJkYSBjb2RlIGFzc2V0IHBhdGhcbiAgICpcbiAgICogQGRlZmF1bHQgLSBERUZBVUxUX0xBTUJEQV9BU1NFVF9QQVRIXG4gICAqL1xuICByZWFkb25seSBsYW1iZGFDb2RlUGF0aD86IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIGFybiBvZiB0aGUgcGhwIGxheWVyIHRvIHVzZVxuICAgKi9cbiAgcmVhZG9ubHkgcGhwTGF5ZXJWZXJzaW9uOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBhcm4gb2YgdGhlIGNvbnNvbGUgbGF5ZXIgdG8gdXNlXG4gICAqL1xuICByZWFkb25seSBjb25zb2xlTGF5ZXJWZXJzaW9uOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBWUEMgZm9yIHRoaXMgc3RhY2tcbiAgICovXG4gIHJlYWRvbmx5IHZwYz86IGVjMi5JVnBjO1xuXG4gIC8qKlxuICAgKiBEYXRhYmFzZSBjb25maWd1cmF0aW9uc1xuICAgKi9cbiAgcmVhZG9ubHkgZGF0YWJhc2VDb25maWc/OiBEYXRhYmFzZUNvbmZpZztcblxuICAvKipcbiAgICogUkRTIFByb3h5IGZvciB0aGUgTGFtYmRhIGZ1bmN0aW9uXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gbm8gZGIgcHJveHlcbiAgICovXG4gIHJlYWRvbmx5IHJkc1Byb3h5PzogcmRzLklEYXRhYmFzZVByb3h5O1xuXG4gIC8qKlxuICAgKiBBZGRpdGlvbmFsIGxhbWJkYSBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICovXG4gIHJlYWRvbmx5IGVudmlyb25tZW50PzogeyBba2V5OiBzdHJpbmddIDogc3RyaW5nIH07XG59XG5cbmV4cG9ydCBjbGFzcyBTZXJ2ZXJsZXNzTGFyYXZlbENvbnNvbGUgZXh0ZW5kcyBTZXJ2ZXJsZXNzQ29uc29sZSB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTZXJ2ZXJsZXNzTGFyYXZlbENvbnNvbGVQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwge1xuICAgICAgLi4ucHJvcHMsXG4gICAgICBoYW5kbGVyOiBwcm9wcy5oYW5kbGVyID8/ICdhcnRpc2FuJyxcbiAgICB9KTtcbiAgfVxufVxuIl19