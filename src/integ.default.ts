import * as path from 'path';
import {
  App, Stack, CfnOutput,
  aws_ec2 as ec2,
  aws_rds as rds,
} from 'aws-cdk-lib';
import { ServerlessLaravel, DatabaseCluster, ServerlessLaravelConsole } from './index';

export class IntegTesting {
  readonly stack: Stack[];

  constructor() {
    const app = new App();
    const env = {
      region: process.env.CDK_DEFAULT_REGION,
      account: process.env.CDK_DEFAULT_ACCOUNT,
    };

    const stack = new Stack(app, 'testing-stack', { env });

    const vpc = new ec2.Vpc(stack, 'Vpc', { maxAzs: 3, natGateways: 1 });

    // the DatabaseCluster sharing the same vpc with the ServerlessLaravel
    const db = new DatabaseCluster(stack, 'DatabaseCluster', {
      databaseOptions: {
        engine: rds.DatabaseClusterEngine.auroraMysql({
          version: rds.AuroraMysqlEngineVersion.VER_2_08_1,
        }),
        instanceProps: {
          vpc,
          instanceType: new ec2.InstanceType('t3.small'),
        },
        instances: 1,
      },
      rdsProxy: true,
    });

    // the ServerlessLaravel
    new ServerlessLaravel(stack, 'ServerlessLaravel', {
      brefLayerVersion: 'arn:aws:lambda:ap-northeast-1:209497400698:layer:php-74-fpm:11',
      lambdaCodePath: path.join(__dirname, '../codebase'),
      vpc,
      databaseConfig: {
        writerEndpoint: db.rdsProxy!.endpoint,
      },
    });

    // the ServerlessLaravelConsole
    new ServerlessLaravelConsole(stack, 'ServerlessLaravelConsole', {
      phpLayerVersion: 'arn:aws:lambda:us-east-1:209497400698:layer:php-74:50',
      consoleLayerVersion: 'arn:aws:lambda:us-east-1:209497400698:layer:console:64',
      lambdaCodePath: path.join(__dirname, '../codebase'),
      vpc,
      databaseConfig: {
        writerEndpoint: db.rdsProxy!.endpoint,
      },
    });

    new CfnOutput(stack, 'RDSProxyEndpoint', { value: db.rdsProxy!.endpoint });
    new CfnOutput(stack, 'DBMasterUser', { value: db.masterUser });
    new CfnOutput(stack, 'DBMasterPasswordSecret', { value: db.masterPassword.secretArn });

    this.stack = [stack];
  }
}

// run the integ testing
new IntegTesting();
