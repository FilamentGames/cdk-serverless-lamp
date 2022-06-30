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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFDQSw2QkFBNkI7QUFDN0IsOERBQThEO0FBQzlELHNHQUFxRjtBQUNyRiw2Q0FPcUI7QUFDckIsMkNBQXVDO0FBcUV2Qzs7R0FFRztBQUNILE1BQWEsYUFBYyxTQUFRLHNCQUFTO0lBSzFDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBeUI7UUFDakUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLHlCQUF5QixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLDRCQUE0QixDQUFDLENBQUM7UUFDckYsTUFBTSxzQkFBc0IsR0FBRyxPQUFPLENBQUM7UUFFdkMsSUFBSSxDQUFDLEdBQUcsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDO1FBRXJCLElBQUksQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQU8sSUFBSSxJQUFJLHdCQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUU7WUFDbkUsT0FBTyxFQUFFLHdCQUFNLENBQUMsT0FBTyxDQUFDLFlBQVk7WUFDcEMsT0FBTyxFQUFFLGtCQUFrQjtZQUMzQixNQUFNLEVBQUU7Z0JBQ04sd0JBQU0sQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsZ0JBQWdCLENBQUM7YUFDdEY7WUFDRCxJQUFJLEVBQUUsd0JBQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxjQUFjLElBQUkseUJBQXlCLENBQUM7WUFDL0UsV0FBVyxFQUFFO2dCQUNYLFdBQVcsRUFBRSxNQUFNO2dCQUNuQixTQUFTLEVBQUUsS0FBSyxDQUFDLGNBQWMsRUFBRSxjQUFjLElBQUksRUFBRTtnQkFDckQsU0FBUyxFQUFFLEtBQUssQ0FBQyxjQUFjLEVBQUUs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RSxjQUFjLEVBQUU7Z0JBQ3RELFNBQVMsRUFBRSxJQUFJLHFCQUFHLENBQUMsZ0JBQWdCLENBQUMsbUJBQW1CLENBQUM7YUFDekQsQ0FBQyxDQUFDO1lBQ0gsdUZBQXVGO1lBQ3ZGLFlBQVksQ0FBQyxXQUFXLENBQUMsSUFBSSxxQkFBRyxDQUFDLGVBQWUsQ0FBQztnQkFDL0MsT0FBTyxFQUFFO29CQUNQLGtDQUFrQztvQkFDbEMsK0JBQStCO29CQUMvQiwrQkFBK0I7b0JBQy9CLHFDQUFxQztpQkFDdEM7Z0JBQ0QsU0FBUyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxDQUFDO2FBQ3hDLENBQUMsQ0FBQyxDQUFDO1lBRUosTUFBTSxZQUFZLEdBQTZCO2dCQUM3QyxHQUFHLEtBQUssQ0FBQyxlQUFlO2dCQUN4QixHQUFHLEVBQUUsS0FBSyxDQUFDLEdBQUc7Z0JBQ2QsT0FBTyxFQUFFLENBQUMsZ0JBQWdCLENBQUM7Z0JBQzNCLE9BQU8sRUFBRSxJQUFJO2dCQUNiLFdBQVcsRUFBRSxHQUFHLG1CQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLFNBQVMsV0FBVztnQkFDbkQsY0FBYyxFQUFFLENBQUMsaUJBQWlCLENBQUM7Z0JBQ25DLElBQUksRUFBRSxZQUFZO2dCQUNsQixVQUFVLEVBQUUsS0FBSyxDQUFDLFVBQVU7YUFDN0IsQ0FBQztZQUVGLHVCQUF1QjtZQUN2QixJQUFJLENBQUMsUUFBUSxHQUFHLFNBQVMsQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLFlBQVksQ0FBQyxDQUFDO1lBQzdELHdEQUF3RDtZQUN4RCxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLENBQUM7U0FDbEQ7SUFDSCxDQUFDOztBQXJGSCwwQ0FzRkMiLCJzb3VyY2VzQ29udGVudCI6WyJcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ0Bhd3MtY2RrL2F3cy1hcGlnYXRld2F5djItYWxwaGEnO1xuaW1wb3J0IHsgSHR0cExhbWJkYUludGVncmF0aW9uIH0gZnJvbSAnQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXl2Mi1pbnRlZ3JhdGlvbnMtYWxwaGEnO1xuaW1wb3J0IHtcbiAgU3RhY2ssIENmbk91dHB1dCwgRHVyYXRpb24sIFJlbW92YWxQb2xpY3ksXG4gIGF3c19lYzIgYXMgZWMyLFxuICBhd3NfaWFtIGFzIGlhbSxcbiAgYXdzX2xhbWJkYSBhcyBsYW1iZGEsXG4gIGF3c19yZHMgYXMgcmRzLFxuICBhd3Nfc2VjcmV0c21hbmFnZXIgYXMgc2VjcmV0c21hbmFnZXIsXG59IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5cbmV4cG9ydCBpbnRlcmZhY2UgRGF0YWJhc2VDb25maWcge1xuICAvKipcbiAgICogVGhlIERCIHdyaXRlciBlbmRwb2ludFxuICAgKi9cbiAgcmVhZG9ubHkgd3JpdGVyRW5kcG9pbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIERCIHJlYWRlciBlbmRwb2ludFxuICAgKi9cbiAgcmVhZG9ubHkgcmVhZGVyRW5kcG9pbnQ/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBEQiBtYXN0ZXIgdXNlcm5hbWVcbiAgICovXG4gIHJlYWRvbmx5IG1hc3RlclVzZXJOYW1lPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgREIgbWFzdGVyIHBhc3N3b3JkIHNlY3JldFxuICAgKi9cbiAgcmVhZG9ubHkgbWFzdGVyVXNlclBhc3N3b3JkU2VjcmV0Pzogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcbn1cblxuLyoqXG4gKiBDb25zdHJ1Y3QgcHJvcGVydGllcyBmb3IgYFNlcnZlcmxlc3NBcGlgXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2VydmVybGVzc0FwaVByb3BzIHtcbiAgLyoqXG4gICAqIGN1c3RvbSBsYW1iZGEgZnVuY3Rpb24gZm9yIHRoZSBBUElcbiAgICpcbiAgICogQGRlZmF1bHQgLSBBIExhbWJkYSBmdW5jdGlvbiB3aXRoIExhdmF2ZWwgYW5kIEJyZWYgc3VwcG9ydCB3aWxsIGJlIGNyZWF0ZWRcbiAgICovXG4gIHJlYWRvbmx5IGhhbmRsZXI/OiBsYW1iZGEuSUZ1bmN0aW9uO1xuXG4gIC8qKlxuICAgKiBjdXN0b20gbGFtYmRhIGNvZGUgYXNzZXQgcGF0aFxuICAgKlxuICAgKiBAZGVmYXVsdCAtIERFRkFVTFRfTEFNQkRBX0FTU0VUX1BBVEhcbiAgICovXG4gIHJlYWRvbmx5IGxhbWJkYUNvZGVQYXRoPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBBV1MgTGFtYmRhIGxheWVyIHZlcnNpb24gZnJvbSB0aGUgQnJlZiBydW50aW1lLlxuICAgKiBlLmcuIGFybjphd3M6bGFtYmRhOnVzLXdlc3QtMToyMDk0OTc0MDA2OTg6bGF5ZXI6cGhwLTc0LWZwbToxMlxuICAgKiBjaGVjayB0aGUgbGF0ZXN0IHJ1bnRpbWUgdmVyaW9uIGFybiBhdCBodHRwczovL2JyZWYuc2gvZG9jcy9ydW50aW1lcy9cbiAgICovXG4gIHJlYWRvbmx5IGJyZWZMYXllclZlcnNpb246IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIFZQQyBmb3IgdGhpcyBzdGFja1xuICAgKi9cbiAgcmVhZG9ubHkgdnBjPzogZWMyLklWcGM7XG5cbiAgLyoqXG4gICAqIERhdGFiYXNlIGNvbmZpZ3VyYXRpb25zXG4gICAqL1xuICByZWFkb25seSBkYXRhYmFzZUNvbmZpZz86IERhdGFiYXNlQ29uZmlnO1xuXG4gIC8qKlxuICAgKiBSRFMgUHJveHkgZm9yIHRoZSBMYW1iZGEgZnVuY3Rpb25cbiAgICpcbiAgICogQGRlZmF1bHQgLSBubyBkYiBwcm94eVxuICAgKi9cbiAgcmVhZG9ubHkgcmRzUHJveHk/OiByZHMuSURhdGFiYXNlUHJveHk7XG5cbn1cblxuLyoqXG4gKiBVc2UgYFNlcnZlcmxlc3NBcGlgIHRvIGNyZWF0ZSB0aGUgc2VydmVybGVzcyBBUEkgcmVzb3VyY2VcbiAqL1xuZXhwb3J0IGNsYXNzIFNlcnZlcmxlc3NBcGkgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICByZWFkb25seSBoYW5kbGVyOiBsYW1iZGEuSUZ1bmN0aW9uO1xuICByZWFkb25seSB2cGM/OiBlYzIuSVZwYztcbiAgcmVhZG9ubHkgZW5kcG9pbnQ6IGFwaWdhdGV3YXkuSHR0cEFwaTtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU2VydmVybGVzc0FwaVByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IERFRkFVTFRfTEFNQkRBX0FTU0VUX1BBVEggPSBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vY29tcG9zZXIvbGFyYXZlbDU4LWJyZWYnKTtcbiAgICBjb25zdCBERUZBVUxUX0RCX01BU1RFUl9VU0VSID0gJ2FkbWluJztcblxuICAgIHRoaXMudnBjID0gcHJvcHMudnBjO1xuXG4gICAgdGhpcy5oYW5kbGVyID0gcHJvcHMuaGFuZGxlciA/PyBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdoYW5kbGVyJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFJPVklERURfQUwyLFxuICAgICAgaGFuZGxlcjogJ3B1YmxpYy9pbmRleC5waHAnLFxuICAgICAgbGF5ZXJzOiBbXG4gICAgICAgIGxhbWJkYS5MYXllclZlcnNpb24uZnJvbUxheWVyVmVyc2lvbkFybih0aGlzLCAnQnJlZlBIUExheWVyJywgcHJvcHMuYnJlZkxheWVyVmVyc2lvbiksXG4gICAgICBdLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHByb3BzPy5sYW1iZGFDb2RlUGF0aCA/PyBERUZBVUxUX0xBTUJEQV9BU1NFVF9QQVRIKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEFQUF9TVE9SQUdFOiAnL3RtcCcsXG4gICAgICAgIERCX1dSSVRFUjogcHJvcHMuZGF0YWJhc2VDb25maWc/LndyaXRlckVuZHBvaW50ID8/ICcnLFxuICAgICAgICBEQl9SRUFERVI6IHByb3BzLmRhdGFiYXNlQ29uZmlnPy5yZWFkZXJFbmRwb2ludCA/PyBwcm9wcy5kYXRhYmFzZUNvbmZpZz8ud3JpdGVyRW5kcG9pbnQgPz8gJycsXG4gICAgICAgIERCX1VTRVI6IHByb3BzLmRhdGFiYXNlQ29uZmlnPy5tYXN0ZXJVc2VyTmFtZSA/PyBERUZBVUxUX0RCX01BU1RFUl9VU0VSLFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMTIwKSxcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgIH0pO1xuXG4gICAgLy8gYWxsb3cgbGFtYmRhIGV4ZWN1dGlvbiByb2xlIHRvIGNvbm5lY3QgdG8gUkRTIHByb3h5XG4gICAgaWYgKHByb3BzLnJkc1Byb3h5KSB7XG4gICAgICB0aGlzLmhhbmRsZXIuYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogWydyZHMtZGI6Y29ubmVjdCddLFxuICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy5yZHNQcm94eS5kYlByb3h5QXJuXSxcbiAgICAgIH0pKTtcbiAgICB9XG5cbiAgICBjb25zdCBlbmRwb2ludCA9IHRoaXMuZW5kcG9pbnQgPSBuZXcgYXBpZ2F0ZXdheS5IdHRwQXBpKHRoaXMsICdhcGlzZXJ2aWNlJywge1xuICAgICAgZGVmYXVsdEludGVncmF0aW9uOiBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdsYW1iZGFIYW5kbGVyJywgdGhpcy5oYW5kbGVyKSxcbiAgICB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdFbmRwb2ludFVSTCcsIHsgdmFsdWU6IGVuZHBvaW50LnVybCEgfSk7XG4gIH1cbn1cblxuLyoqXG4gKiBDb25zdHJ1Y3QgcHJvcGVydGllcyBmb3IgYFNlcnZlcmxlc3NMYXJhdmVsYFxuICovXG5leHBvcnQgaW50ZXJmYWNlIFNlcnZlcmxlc3NMYXJhdmVsUHJvcHMgZXh0ZW5kcyBTZXJ2ZXJsZXNzQXBpUHJvcHMge1xuICAvKipcbiAgICogcGF0aCB0byB5b3VyIGxvY2FsIGxhcmF2ZWwgZGlyZWN0b3J5IHdpdGggYnJlZlxuICAgKi9cbiAgcmVhZG9ubHkgbGFyYXZlbFBhdGg6IHN0cmluZztcblxufVxuXG4vKipcbiAqIFVzZSBgU2VydmVybGVzc0xhcmF2ZWxgIHRvIGNyZWF0ZSB0aGUgc2VydmVybGVzcyBMYXJhdmVsIHJlc291cmNlXG4gKi9cbmV4cG9ydCBjbGFzcyBTZXJ2ZXJsZXNzTGFyYXZlbCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHJlYWRvbmx5IGFwaTpTZXJ2ZXJsZXNzQXBpO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTZXJ2ZXJsZXNzTGFyYXZlbFByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcbiAgICB0aGlzLmFwaSA9IG5ldyBTZXJ2ZXJsZXNzQXBpKHRoaXMsIGlkLCB7XG4gICAgICBsYW1iZGFDb2RlUGF0aDogcHJvcHMubGFyYXZlbFBhdGgsXG4gICAgICBicmVmTGF5ZXJWZXJzaW9uOiBwcm9wcy5icmVmTGF5ZXJWZXJzaW9uLFxuICAgICAgaGFuZGxlcjogcHJvcHMuaGFuZGxlcixcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgZGF0YWJhc2VDb25maWc6IHByb3BzLmRhdGFiYXNlQ29uZmlnLFxuICAgICAgcmRzUHJveHk6IHByb3BzLnJkc1Byb3h5LFxuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGF0YWJhc2VQcm9wcyB7XG4gIC8qKlxuICAgKiBkYXRhYmFzZSBjbHVzdGVyIGVuZ2luZVxuICAgKlxuICAgKiBAZGVmYXVsdCBBVVJPUkFfTVlTUUxcbiAgICovXG4gIHJlYWRvbmx5IGVuZ2luZT86IHJkcy5JQ2x1c3RlckVuZ2luZTtcblxuICAvKipcbiAgICogbWFzdGVyIHVzZXJuYW1lXG4gICAqXG4gICAqIEBkZWZhdWx0IGFkbWluXG4gICAqL1xuICByZWFkb25seSBtYXN0ZXJVc2VyTmFtZT86IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIFZQQyBmb3IgdGhlIERhdGFiYXNlQ2x1c3RlclxuICAgKi9cbiAgcmVhZG9ubHkgdnBjOiBlYzIuSVZwYztcblxuICAvKipcbiAgICogaW5zdGFuY2UgdHlwZSBvZiB0aGUgY2x1c3RlclxuICAgKlxuICAgKiBAZGVmYXVsdCAtIHQzLm1lZGl1bSAob3IsIG1vcmUgcHJlY2lzZWx5LCBkYi50My5tZWRpdW0pXG4gICAqL1xuICByZWFkb25seSBpbnN0YW5jZVR5cGU/OiBlYzIuSW5zdGFuY2VUeXBlO1xuXG4gIC8qKlxuICAgKiBlbmFibGUgdGhlIEFtYXpvbiBSRFMgcHJveHlcbiAgICpcbiAgICogQGRlZmF1bHQgdHJ1ZVxuICAgKi9cbiAgcmVhZG9ubHkgcmRzUHJveHk/OiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBBZGRpdGlvbmFsIFJEUyBQcm94eSBPcHRpb25zXG4gICAqL1xuICByZWFkb25seSByZHNQcm94eU9wdGlvbnM/OiByZHMuRGF0YWJhc2VQcm94eU9wdGlvbnM7XG5cbiAgLyoqXG4gICAqIEhvdyBtYW55IHJlcGxpY2FzL2luc3RhbmNlcyB0byBjcmVhdGUuIEhhcyB0byBiZSBhdCBsZWFzdCAxLlxuICAgKlxuICAgKiBAZGVmYXVsdCAxXG4gICAqL1xuICByZWFkb25seSBpbnN0YW5jZUNhcGFjaXR5PzogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBMaXN0IG9mIHN1Ym5ldHMgdG8gdXNlIHdoZW4gY3JlYXRpbmcgc3VibmV0IGdyb3VwLlxuICAgKi9cbiAgcmVhZG9ubHkgdnBjU3VibmV0cz86IGVjMi5TdWJuZXRTZWxlY3Rpb247XG5cbiAgLyoqXG4gICAqIERlZmluZSBhZGRpdGlvbmFsIGNsdXN0ZXIgb3B0aW9uc1xuICAgKi9cbiAgcmVhZG9ubHkgZXh0cmFEYXRhYmFzZU9wdGlvbnM/OiByZHMuRGF0YWJhc2VDbHVzdGVyUHJvcHM7XG59XG5cbmV4cG9ydCBjbGFzcyBEYXRhYmFzZUNsdXN0ZXIgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICByZWFkb25seSByZHNQcm94eT86IHJkcy5EYXRhYmFzZVByb3h5O1xuICByZWFkb25seSBtYXN0ZXJVc2VyOiBzdHJpbmc7XG4gIHJlYWRvbmx5IG1hc3RlclBhc3N3b3JkOiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBEYXRhYmFzZVByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIHRoaXMubWFzdGVyVXNlciA9IHByb3BzLm1hc3RlclVzZXJOYW1lID8/ICdhZG1pbic7XG5cbiAgICAvLyBnZW5lcmF0ZSBhbmQgc3RvcmUgcGFzc3dvcmQgZm9yIG1hc3RlclVzZXIgaW4gdGhlIHNlY3JldHMgbWFuYWdlclxuICAgIGNvbnN0IG1hc3RlclVzZXJTZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdEYk1hc3RlclNlY3JldCcsIHtcbiAgICAgIHNlY3JldE5hbWU6IGAke1N0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0tRGJNYXN0ZXJTZWNyZXRgLFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgc2VjcmV0U3RyaW5nVGVtcGxhdGU6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICB1c2VybmFtZTogdGhpcy5tYXN0ZXJVc2VyLFxuICAgICAgICB9KSxcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDEyLFxuICAgICAgICBleGNsdWRlUHVuY3R1YXRpb246IHRydWUsXG4gICAgICAgIGluY2x1ZGVTcGFjZTogZmFsc2UsXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiAncGFzc3dvcmQnLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMubWFzdGVyUGFzc3dvcmQgPSBtYXN0ZXJVc2VyU2VjcmV0O1xuXG4gICAgY29uc3QgZGJDb25uZWN0aW9uR3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0RCIFNlY3VyaXR5IEdyb3VwJywge1xuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgfSk7XG4gICAgZGJDb25uZWN0aW9uR3JvdXAuY29ubmVjdGlvbnMuYWxsb3dJbnRlcm5hbGx5KGVjMi5Qb3J0LnRjcCgzMzA2KSk7XG5cbiAgICBjb25zdCBkYkNsdXN0ZXIgPSBuZXcgcmRzLkRhdGFiYXNlQ2x1c3Rlcih0aGlzLCAnREJDbHVzdGVyJywge1xuICAgICAgLi4ucHJvcHMuZXh0cmFEYXRhYmFzZU9wdGlvbnMsXG4gICAgICBlbmdpbmU6IHByb3BzLmVuZ2luZSA/PyByZHMuRGF0YWJhc2VDbHVzdGVyRW5naW5lLmF1cm9yYU15c3FsKHtcbiAgICAgICAgdmVyc2lvbjogcmRzLkF1cm9yYU15c3FsRW5naW5lVmVyc2lvbi5WRVJfMl8wOF8xLFxuICAgICAgfSksXG4gICAgICBpbnN0YW5jZVByb3BzOiB7XG4gICAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgICBpbnN0YW5jZVR5cGU6IHByb3BzLmluc3RhbmNlVHlwZSA/PyBuZXcgZWMyLkluc3RhbmNlVHlwZSgndDMubWVkaXVtJyksXG4gICAgICAgIHNlY3VyaXR5R3JvdXBzOiBbZGJDb25uZWN0aW9uR3JvdXBdLFxuICAgICAgICB2cGNTdWJuZXRzOiBwcm9wcy52cGNTdWJuZXRzLFxuICAgICAgfSxcbiAgICAgIGNyZWRlbnRpYWxzOiByZHMuQ3JlZGVudGlhbHMuZnJvbVNlY3JldChtYXN0ZXJVc2VyU2VjcmV0KSxcbiAgICAgIGluc3RhbmNlczogcHJvcHMuaW5zdGFuY2VDYXBhY2l0eSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIFdvcmthcm91bmQgZm9yIGJ1ZyB3aGVyZSBUYXJnZXRHcm91cE5hbWUgaXMgbm90IHNldCBidXQgcmVxdWlyZWRcbiAgICBsZXQgY2ZuRGJJbnN0YW5jZSA9IGRiQ2x1c3Rlci5ub2RlLmNoaWxkcmVuLmZpbmQoKGNoaWxkOiBhbnkpID0+IHtcbiAgICAgIHJldHVybiBjaGlsZCBpbnN0YW5jZW9mIHJkcy5DZm5EQkluc3RhbmNlO1xuICAgIH0pIGFzIHJkcy5DZm5EQkluc3RhbmNlO1xuXG4gICAgLy8gZW5hYmxlIHRoZSBSRFMgcHJveHkgYnkgZGVmYXVsdFxuICAgIGlmIChwcm9wcy5yZHNQcm94eSAhPT0gZmFsc2UpIHtcbiAgICAgIC8vIGNyZWF0ZSBpYW0gcm9sZSBmb3IgUkRTIHByb3h5XG4gICAgICBjb25zdCByZHNQcm94eVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1Jkc1Byb3h5Um9sZScsIHtcbiAgICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ3Jkcy5hbWF6b25hd3MuY29tJyksXG4gICAgICB9KTtcbiAgICAgIC8vIHNlZTogaHR0cHM6Ly9hd3MuYW1hem9uLmNvbS90dy9ibG9ncy9jb21wdXRlL3VzaW5nLWFtYXpvbi1yZHMtcHJveHktd2l0aC1hd3MtbGFtYmRhL1xuICAgICAgcmRzUHJveHlSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdzZWNyZXRzbWFuYWdlcjpHZXRSZXNvdXJjZVBvbGljeScsXG4gICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkdldFNlY3JldFZhbHVlJyxcbiAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6RGVzY3JpYmVTZWNyZXQnLFxuICAgICAgICAgICdzZWNyZXRzbWFuYWdlcjpMaXN0U2VjcmV0VmVyc2lvbklkcycsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW21hc3RlclVzZXJTZWNyZXQuc2VjcmV0QXJuXSxcbiAgICAgIH0pKTtcblxuICAgICAgY29uc3QgcHJveHlPcHRpb25zOiByZHMuRGF0YWJhc2VQcm94eU9wdGlvbnMgPSB7XG4gICAgICAgIC4uLnByb3BzLnJkc1Byb3h5T3B0aW9ucyxcbiAgICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICAgIHNlY3JldHM6IFttYXN0ZXJVc2VyU2VjcmV0XSxcbiAgICAgICAgaWFtQXV0aDogdHJ1ZSxcbiAgICAgICAgZGJQcm94eU5hbWU6IGAke1N0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0tUkRTUHJveHlgLFxuICAgICAgICBzZWN1cml0eUdyb3VwczogW2RiQ29ubmVjdGlvbkdyb3VwXSxcbiAgICAgICAgcm9sZTogcmRzUHJveHlSb2xlLFxuICAgICAgICB2cGNTdWJuZXRzOiBwcm9wcy52cGNTdWJuZXRzLFxuICAgICAgfTtcblxuICAgICAgLy8gY3JlYXRlIHRoZSBSRFMgcHJveHlcbiAgICAgIHRoaXMucmRzUHJveHkgPSBkYkNsdXN0ZXIuYWRkUHJveHkoJ1JEU1Byb3h5JywgcHJveHlPcHRpb25zKTtcbiAgICAgIC8vIGVuc3VyZSBEQiBpbnN0YW5jZSBpcyByZWFkeSBiZWZvcmUgY3JlYXRpbmcgdGhlIHByb3h5XG4gICAgICB0aGlzLnJkc1Byb3h5Py5ub2RlLmFkZERlcGVuZGVuY3koY2ZuRGJJbnN0YW5jZSk7XG4gICAgfVxuICB9XG59XG4iXX0=