
import * as path from 'path';
import * as apigateway from '@aws-cdk/aws-apigatewayv2-alpha';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import {
  Stack, CfnOutput, Duration,
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_rds as rds,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';


export interface DatabaseConfig {
  /**
   * The DB writer endpoint
   */
  readonly writerEndpoint: string;

  /**
   * The DB reader endpoint
   */
  readonly readerEndpoint?: string;

  /**
   * The DB master username
   */
  readonly masterUserName?: string;

  /**
   * The DB master password secret
   */
  readonly masterUserPasswordSecret?: secretsmanager.ISecret;
}

/**
 * Construct properties for `ServerlessApi`
 */
export interface ServerlessApiProps {
  /**
   * custom lambda function for the API
   *
   * @default - A Lambda function with Lavavel and Bref support will be created
   */
  readonly handler?: lambda.IFunction;

  /**
   * custom lambda code asset path
   *
   * @default - DEFAULT_LAMBDA_ASSET_PATH
   */
  readonly lambdaCodePath?: string;

  /**
   * AWS Lambda layer version from the Bref runtime.
   * e.g. arn:aws:lambda:us-west-1:209497400698:layer:php-74-fpm:12
   * check the latest runtime verion arn at https://bref.sh/docs/runtimes/
   */
  readonly brefLayerVersion: string;

  /**
   * The VPC for this stack
   */
  readonly vpc?: ec2.IVpc;

  /**
   * Database configurations
   */
  readonly databaseConfig?: DatabaseConfig;

  /**
   * RDS Proxy for the Lambda function
   *
   * @default - no db proxy
   */
  readonly rdsProxy?: rds.IDatabaseProxy;

  /**
   * Additional app environment variables
   */
  readonly environment?: {[key:string]: string};
}

/**
 * Use `ServerlessApi` to create the serverless API resource
 */
export class ServerlessApi extends Construct {
  readonly handler: lambda.IFunction;
  readonly vpc?: ec2.IVpc;
  readonly endpoint: apigateway.HttpApi;

  constructor(scope: Construct, id: string, props: ServerlessApiProps) {
    super(scope, id);

    const DEFAULT_LAMBDA_ASSET_PATH = path.join(__dirname, '../composer/laravel58-bref');
    const DEFAULT_DB_MASTER_USER = 'admin';

    this.vpc = props.vpc;

    this.handler = props.handler ?? new lambda.Function(this, 'handler', {
      runtime: lambda.Runtime.PROVIDED_AL2,
      handler: 'public/index.php',
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(this, 'BrefPHPLayer', props.brefLayerVersion),
      ],
      code: lambda.Code.fromAsset(props?.lambdaCodePath ?? DEFAULT_LAMBDA_ASSET_PATH),
      environment: {
        APP_STORAGE: '/tmp',
        DB_WRITER: props.databaseConfig?.writerEndpoint ?? '',
        DB_READER: props.databaseConfig?.readerEndpoint ?? props.databaseConfig?.writerEndpoint ?? '',
        DB_USER: props.databaseConfig?.masterUserName ?? DEFAULT_DB_MASTER_USER,
        ...props.environment,
      },
      timeout: Duration.seconds(120),
      vpc: props.vpc,
    });

    // allow lambda execution role to connect to RDS proxy
    if (props.rdsProxy) {
      this.handler.addToRolePolicy(new iam.PolicyStatement({
        actions: ['rds-db:connect'],
        resources: [props.rdsProxy.dbProxyArn],
      }));
    }

    const endpoint = this.endpoint = new apigateway.HttpApi(this, 'apiservice', {
      defaultIntegration: new HttpLambdaIntegration('lambdaHandler', this.handler),
    });
    new CfnOutput(this, 'EndpointURL', { value: endpoint.url! });
  }
}

/**
 * Construct properties for `ServerlessLaravel`
 */
export interface ServerlessLaravelProps extends ServerlessApiProps {

}

/**
 * Use `ServerlessLaravel` to create the serverless Laravel resource
 */
export class ServerlessLaravel extends ServerlessApi {
  constructor(scope: Construct, id: string, props: ServerlessLaravelProps) {
    super(scope, id, props);
  }
}

export interface DatabaseProps {
  /**
   * master username
   *
   * @default admin
   */
  readonly masterUserName?: string;

  /**
   * enable the Amazon RDS proxy
   *
   * @default true
   */
  readonly rdsProxy?: boolean;

  /**
   * Additional RDS Proxy Options
   */
  readonly rdsProxyOptions?: rds.DatabaseProxyOptions;

  /**
   * Define cluster options
   */
  readonly databaseOptions: rds.DatabaseClusterProps;
}

export class DatabaseCluster extends Construct {
  readonly rdsProxy?: rds.DatabaseProxy;
  readonly masterUser: string;
  readonly masterPassword: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    this.masterUser = props.masterUserName ?? 'admin';

    // generate and store password for masterUser in the secrets manager
    const masterUserSecret = new secretsmanager.Secret(this, 'DbMasterSecret', {
      secretName: `${Stack.of(this).stackName}-DbMasterSecret`,
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

    const dbConnectionGroup = new ec2.SecurityGroup(this, 'DB Security Group', {
      vpc: props.databaseOptions.instanceProps.vpc,
      allowAllOutbound: false,
    });
    dbConnectionGroup.connections.allowInternally(ec2.Port.tcp(3306));

    const dbCluster = new rds.DatabaseCluster(this, 'DBCluster', {
      ...props.databaseOptions,
      instanceProps: {
        ...props.databaseOptions.instanceProps,
        securityGroups: [dbConnectionGroup],
      },
      credentials: rds.Credentials.fromSecret(masterUserSecret),
    });

    // Workaround for bug where TargetGroupName is not set but required
    let cfnDbInstance = dbCluster.node.children.find((child: any) => {
      return child instanceof rds.CfnDBInstance;
    }) as rds.CfnDBInstance;

    // enable the RDS proxy by default
    if (props.rdsProxy !== false) {
      // create iam role for RDS proxy
      const rdsProxyRole = new iam.Role(this, 'RdsProxyRole', {
        assumedBy: new iam.ServicePrincipal('rds.amazonaws.com'),
      });
      // see: https://aws.amazon.com/tw/blogs/compute/using-amazon-rds-proxy-with-aws-lambda/
      rdsProxyRole.addToPolicy(new iam.PolicyStatement({
        actions: [
          'secretsmanager:GetResourcePolicy',
          'secretsmanager:GetSecretValue',
          'secretsmanager:DescribeSecret',
          'secretsmanager:ListSecretVersionIds',
        ],
        resources: [masterUserSecret.secretArn],
      }));

      const proxyOptions: rds.DatabaseProxyOptions = {
        ...props.rdsProxyOptions,
        vpc: props.databaseOptions.instanceProps.vpc,
        secrets: [masterUserSecret],
        iamAuth: true,
        dbProxyName: `${Stack.of(this).stackName}-RDSProxy`,
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

/**
 * Construct properties for `ServerlessApi`
 */
export interface ServerlessConsoleProps {
  /**
   * path to console binary relative to lambdaCodePath
   */
  readonly handler: string;

  /**
   * custom lambda code asset path
   *
   * @default - DEFAULT_LAMBDA_ASSET_PATH
   */
  readonly lambdaCodePath?: string;

  /**
   * The arn of the php layer to use
   */
  readonly phpLayerVersion: string;

  /**
   * The arn of the console layer to use
   */
  readonly consoleLayerVersion: string;

  /**
   * The VPC for this stack
   */
  readonly vpc?: ec2.IVpc;

  /**
   * Database configurations
   */
  readonly databaseConfig?: DatabaseConfig;

  /**
   * RDS Proxy for the Lambda function
   *
   * @default - no db proxy
   */
  readonly rdsProxy?: rds.IDatabaseProxy;

  /**
   * Additional lambda environment variables
   */
  readonly environment?: { [key: string] : string };
}

/**
 * Use `ServerlessConsole` to create the serverless console resource
 */
export class ServerlessConsole extends Construct {
  readonly handler: lambda.IFunction;
  readonly vpc?: ec2.IVpc;

  constructor(scope: Construct, id: string, props: ServerlessConsoleProps) {
    super(scope, id);

    const DEFAULT_LAMBDA_ASSET_PATH = path.join(__dirname, '../composer/laravel58-bref');
    const DEFAULT_DB_MASTER_USER = 'admin';

    this.vpc = props.vpc;

    this.handler = new lambda.Function(this, 'handler', {
      runtime: lambda.Runtime.PROVIDED_AL2,
      handler: props.handler,
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(this, 'PHPLayer', props.phpLayerVersion),
        lambda.LayerVersion.fromLayerVersionArn(this, 'ConsoleLayer', props.consoleLayerVersion),
      ],
      code: lambda.Code.fromAsset(props?.lambdaCodePath ?? DEFAULT_LAMBDA_ASSET_PATH),
      environment: {
        APP_STORAGE: '/tmp',
        DB_WRITER: props.databaseConfig?.writerEndpoint ?? '',
        DB_READER: props.databaseConfig?.readerEndpoint ?? props.databaseConfig?.writerEndpoint ?? '',
        DB_USER: props.databaseConfig?.masterUserName ?? DEFAULT_DB_MASTER_USER,
        ...props.environment,
      },
      timeout: Duration.seconds(120),
      vpc: props.vpc,
    });

    // allow lambda execution role to connect to RDS proxy
    if (props.rdsProxy) {
      this.handler.addToRolePolicy(new iam.PolicyStatement({
        actions: ['rds-db:connect'],
        resources: [props.rdsProxy.dbProxyArn],
      }));
    }
  }
}

/**
 * Construct properties for `ServerlessLaravel`
 */
export interface ServerlessLaravelConsoleProps {
  /**
   * path to console binary relative to lambdaCodePath
   * @default - artisan
   */
  readonly handler?: string;

  /**
   * custom lambda code asset path
   *
   * @default - DEFAULT_LAMBDA_ASSET_PATH
   */
  readonly lambdaCodePath?: string;

  /**
   * The arn of the php layer to use
   */
  readonly phpLayerVersion: string;

  /**
   * The arn of the console layer to use
   */
  readonly consoleLayerVersion: string;

  /**
   * The VPC for this stack
   */
  readonly vpc?: ec2.IVpc;

  /**
   * Database configurations
   */
  readonly databaseConfig?: DatabaseConfig;

  /**
   * RDS Proxy for the Lambda function
   *
   * @default - no db proxy
   */
  readonly rdsProxy?: rds.IDatabaseProxy;

  /**
   * Additional lambda environment variables
   */
  readonly environment?: { [key: string] : string };
}

export class ServerlessLaravelConsole extends ServerlessConsole {
  constructor(scope: Construct, id: string, props: ServerlessLaravelConsoleProps) {
    super(scope, id, {
      ...props,
      handler: props.handler ?? 'artisan',
    });
  }
}