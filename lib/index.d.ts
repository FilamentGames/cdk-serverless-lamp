import * as apigateway from '@aws-cdk/aws-apigatewayv2-alpha';
import { aws_ec2 as ec2, aws_lambda as lambda, aws_rds as rds, aws_secretsmanager as secretsmanager } from 'aws-cdk-lib';
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
}
/**
 * Use `ServerlessApi` to create the serverless API resource
 */
export declare class ServerlessApi extends Construct {
    readonly handler: lambda.IFunction;
    readonly vpc?: ec2.IVpc;
    readonly endpoint: apigateway.HttpApi;
    constructor(scope: Construct, id: string, props: ServerlessApiProps);
}
/**
 * Construct properties for `ServerlessLaravel`
 */
export interface ServerlessLaravelProps extends ServerlessApiProps {
    /**
     * path to your local laravel directory with bref
     */
    readonly laravelPath: string;
}
/**
 * Use `ServerlessLaravel` to create the serverless Laravel resource
 */
export declare class ServerlessLaravel extends Construct {
    readonly api: ServerlessApi;
    constructor(scope: Construct, id: string, props: ServerlessLaravelProps);
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
export declare class DatabaseCluster extends Construct {
    readonly rdsProxy?: rds.DatabaseProxy;
    readonly masterUser: string;
    readonly masterPassword: secretsmanager.ISecret;
    constructor(scope: Construct, id: string, props: DatabaseProps);
}
