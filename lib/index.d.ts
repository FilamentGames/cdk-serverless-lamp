import * as apigateway from '@aws-cdk/aws-apigatewayv2-alpha';
import { aws_ec2 as ec2, aws_lambda as lambda, aws_rds as rds, aws_secretsmanager as secretsmanager } from 'aws-cdk-lib';
import { ISecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { IDatabaseCluster } from 'aws-cdk-lib/aws-rds';
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
    readonly environment?: {
        [key: string]: string;
    };
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
}
/**
 * Use `ServerlessLaravel` to create the serverless Laravel resource
 */
export declare class ServerlessLaravel extends ServerlessApi {
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
    readonly dbConnectionGroup: ISecurityGroup;
    readonly dbCluster: IDatabaseCluster;
    constructor(scope: Construct, id: string, props: DatabaseProps);
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
    readonly environment?: {
        [key: string]: string;
    };
}
/**
 * Use `ServerlessConsole` to create the serverless console resource
 */
export declare class ServerlessConsole extends Construct {
    readonly handler: lambda.IFunction;
    readonly vpc?: ec2.IVpc;
    constructor(scope: Construct, id: string, props: ServerlessConsoleProps);
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
    readonly environment?: {
        [key: string]: string;
    };
}
export declare class ServerlessLaravelConsole extends ServerlessConsole {
    constructor(scope: Construct, id: string, props: ServerlessLaravelConsoleProps);
}
