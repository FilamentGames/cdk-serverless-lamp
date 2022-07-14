"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegTesting = void 0;
const path = require("path");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_lambda_1 = require("aws-cdk-lib/aws-lambda");
const index_1 = require("./index");
class IntegTesting {
    constructor() {
        const app = new aws_cdk_lib_1.App();
        const env = {
            region: process.env.CDK_DEFAULT_REGION,
            account: process.env.CDK_DEFAULT_ACCOUNT,
        };
        const stack = new aws_cdk_lib_1.Stack(app, 'testing-stack', { env });
        const vpc = new aws_cdk_lib_1.aws_ec2.Vpc(stack, 'Vpc', { maxAzs: 3, natGateways: 1 });
        // the DatabaseCluster sharing the same vpc with the ServerlessLaravel
        const db = new index_1.DatabaseCluster(stack, 'DatabaseCluster', {
            databaseOptions: {
                engine: aws_cdk_lib_1.aws_rds.DatabaseClusterEngine.auroraMysql({
                    version: aws_cdk_lib_1.aws_rds.AuroraMysqlEngineVersion.VER_2_08_1,
                }),
                instanceProps: {
                    vpc,
                    instanceType: new aws_cdk_lib_1.aws_ec2.InstanceType('t3.small'),
                },
                instances: 1,
            },
            rdsProxy: true,
        });
        // the ServerlessLaravel
        new index_1.ServerlessLaravel(stack, 'ServerlessLaravel', {
            brefLayerVersion: 'arn:aws:lambda:ap-northeast-1:209497400698:layer:php-74-fpm:11',
            lambdaCodePath: path.join(__dirname, '../codebase'),
            vpc,
            databaseConfig: {
                writerEndpoint: db.rdsProxy.endpoint,
            },
            tracing: aws_lambda_1.Tracing.ACTIVE,
        });
        // the ServerlessLaravelConsole
        new index_1.ServerlessLaravelConsole(stack, 'ServerlessLaravelConsole', {
            phpLayerVersion: 'arn:aws:lambda:us-east-1:209497400698:layer:php-74:50',
            consoleLayerVersion: 'arn:aws:lambda:us-east-1:209497400698:layer:console:64',
            lambdaCodePath: path.join(__dirname, '../codebase'),
            vpc,
            databaseConfig: {
                writerEndpoint: db.rdsProxy.endpoint,
            },
        });
        new aws_cdk_lib_1.CfnOutput(stack, 'RDSProxyEndpoint', { value: db.rdsProxy.endpoint });
        new aws_cdk_lib_1.CfnOutput(stack, 'DBMasterUser', { value: db.masterUser });
        new aws_cdk_lib_1.CfnOutput(stack, 'DBMasterPasswordSecret', { value: db.masterPassword.secretArn });
        this.stack = [stack];
    }
}
exports.IntegTesting = IntegTesting;
// run the integ testing
new IntegTesting();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZWcuZGVmYXVsdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9pbnRlZy5kZWZhdWx0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDZCQUE2QjtBQUM3Qiw2Q0FJcUI7QUFDckIsdURBQWlEO0FBQ2pELG1DQUF1RjtBQUV2RixNQUFhLFlBQVk7SUFHdkI7UUFDRSxNQUFNLEdBQUcsR0FBRyxJQUFJLGlCQUFHLEVBQUUsQ0FBQztRQUN0QixNQUFNLEdBQUcsR0FBRztZQUNWLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQjtZQUN0QyxPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUI7U0FDekMsQ0FBQztRQUVGLE1BQU0sS0FBSyxHQUFHLElBQUksbUJBQUssQ0FBQyxHQUFHLEVBQUUsZUFBZSxFQUFFLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUV2RCxNQUFNLEdBQUcsR0FBRyxJQUFJLHFCQUFHLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLFdBQVcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRXJFLHNFQUFzRTtRQUN0RSxNQUFNLEVBQUUsR0FBRyxJQUFJLHVCQUFlLENBQUMsS0FBSyxFQUFFLGlCQUFpQixFQUFFO1lBQ3ZELGVBQWUsRUFBRTtnQkFDZixNQUFNLEVBQUUscUJBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxXQUFXLENBQUM7b0JBQzVDLE9BQU8sRUFBRSxxQkFBRyxDQUFDLHdCQUF3QixDQUFDLFVBQVU7aUJBQ2pELENBQUM7Z0JBQ0YsYUFBYSxFQUFFO29CQUNiLEdBQUc7b0JBQ0gsWUFBWSxFQUFFLElBQUkscUJBQUcsQ0FBQyxZQUFZLENBQUMsVUFBVSxDQUFDO2lCQUMvQztnQkFDRCxTQUFTLEVBQUUsQ0FBQzthQUNiO1lBQ0QsUUFBUSxFQUFFLElBQUk7U0FDZixDQUFDLENBQUM7UUFFSCx3QkFBd0I7UUFDeEIsSUFBSSx5QkFBaUIsQ0FBQyxLQUFLLEVBQUUsbUJBQW1CLEVBQUU7WUFDaEQsZ0JBQWdCLEVBQUUsZ0VBQWdFO1lBQ2xGLGNBQWMsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxhQUFhLENBQUM7WUFDbkQsR0FBRztZQUNILGNBQWMsRUFBRTtnQkFDZCxjQUFjLEVBQUUsRUFBRSxDQUFDLFFBQVMsQ0FBQyxRQUFRO2FBQ3RDO1lBQ0QsT0FBTyxFQUFFLG9CQUFPLENBQUMsTUFBTTtTQUN4QixDQUFDLENBQUM7UUFFSCwrQkFBK0I7UUFDL0IsSUFBSSxnQ0FBd0IsQ0FBQyxLQUFLLEVBQUUsMEJBQTBCLEVBQUU7WUFDOUQsZUFBZSxFQUFFLHVEQUF1RDtZQUN4RSxtQkFBbUIsRUFBRSx3REFBd0Q7WUFDN0UsY0FBYyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLGFBQWEsQ0FBQztZQUNuRCxHQUFHO1lBQ0gsY0FBYyxFQUFFO2dCQUNkLGNBQWMsRUFBRSxFQUFFLENBQUMsUUFBUyxDQUFDLFFBQVE7YUFDdEM7U0FDRixDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsS0FBSyxFQUFFLGtCQUFrQixFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxRQUFTLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUMzRSxJQUFJLHVCQUFTLENBQUMsS0FBSyxFQUFFLGNBQWMsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUMvRCxJQUFJLHVCQUFTLENBQUMsS0FBSyxFQUFFLHdCQUF3QixFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUV2RixJQUFJLENBQUMsS0FBSyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdkIsQ0FBQztDQUNGO0FBekRELG9DQXlEQztBQUVELHdCQUF3QjtBQUN4QixJQUFJLFlBQVksRUFBRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7XG4gIEFwcCwgU3RhY2ssIENmbk91dHB1dCxcbiAgYXdzX2VjMiBhcyBlYzIsXG4gIGF3c19yZHMgYXMgcmRzLFxufSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBUcmFjaW5nIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBTZXJ2ZXJsZXNzTGFyYXZlbCwgRGF0YWJhc2VDbHVzdGVyLCBTZXJ2ZXJsZXNzTGFyYXZlbENvbnNvbGUgfSBmcm9tICcuL2luZGV4JztcblxuZXhwb3J0IGNsYXNzIEludGVnVGVzdGluZyB7XG4gIHJlYWRvbmx5IHN0YWNrOiBTdGFja1tdO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIGNvbnN0IGFwcCA9IG5ldyBBcHAoKTtcbiAgICBjb25zdCBlbnYgPSB7XG4gICAgICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTixcbiAgICAgIGFjY291bnQ6IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQsXG4gICAgfTtcblxuICAgIGNvbnN0IHN0YWNrID0gbmV3IFN0YWNrKGFwcCwgJ3Rlc3Rpbmctc3RhY2snLCB7IGVudiB9KTtcblxuICAgIGNvbnN0IHZwYyA9IG5ldyBlYzIuVnBjKHN0YWNrLCAnVnBjJywgeyBtYXhBenM6IDMsIG5hdEdhdGV3YXlzOiAxIH0pO1xuXG4gICAgLy8gdGhlIERhdGFiYXNlQ2x1c3RlciBzaGFyaW5nIHRoZSBzYW1lIHZwYyB3aXRoIHRoZSBTZXJ2ZXJsZXNzTGFyYXZlbFxuICAgIGNvbnN0IGRiID0gbmV3IERhdGFiYXNlQ2x1c3RlcihzdGFjaywgJ0RhdGFiYXNlQ2x1c3RlcicsIHtcbiAgICAgIGRhdGFiYXNlT3B0aW9uczoge1xuICAgICAgICBlbmdpbmU6IHJkcy5EYXRhYmFzZUNsdXN0ZXJFbmdpbmUuYXVyb3JhTXlzcWwoe1xuICAgICAgICAgIHZlcnNpb246IHJkcy5BdXJvcmFNeXNxbEVuZ2luZVZlcnNpb24uVkVSXzJfMDhfMSxcbiAgICAgICAgfSksXG4gICAgICAgIGluc3RhbmNlUHJvcHM6IHtcbiAgICAgICAgICB2cGMsXG4gICAgICAgICAgaW5zdGFuY2VUeXBlOiBuZXcgZWMyLkluc3RhbmNlVHlwZSgndDMuc21hbGwnKSxcbiAgICAgICAgfSxcbiAgICAgICAgaW5zdGFuY2VzOiAxLFxuICAgICAgfSxcbiAgICAgIHJkc1Byb3h5OiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gdGhlIFNlcnZlcmxlc3NMYXJhdmVsXG4gICAgbmV3IFNlcnZlcmxlc3NMYXJhdmVsKHN0YWNrLCAnU2VydmVybGVzc0xhcmF2ZWwnLCB7XG4gICAgICBicmVmTGF5ZXJWZXJzaW9uOiAnYXJuOmF3czpsYW1iZGE6YXAtbm9ydGhlYXN0LTE6MjA5NDk3NDAwNjk4OmxheWVyOnBocC03NC1mcG06MTEnLFxuICAgICAgbGFtYmRhQ29kZVBhdGg6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9jb2RlYmFzZScpLFxuICAgICAgdnBjLFxuICAgICAgZGF0YWJhc2VDb25maWc6IHtcbiAgICAgICAgd3JpdGVyRW5kcG9pbnQ6IGRiLnJkc1Byb3h5IS5lbmRwb2ludCxcbiAgICAgIH0sXG4gICAgICB0cmFjaW5nOiBUcmFjaW5nLkFDVElWRSxcbiAgICB9KTtcblxuICAgIC8vIHRoZSBTZXJ2ZXJsZXNzTGFyYXZlbENvbnNvbGVcbiAgICBuZXcgU2VydmVybGVzc0xhcmF2ZWxDb25zb2xlKHN0YWNrLCAnU2VydmVybGVzc0xhcmF2ZWxDb25zb2xlJywge1xuICAgICAgcGhwTGF5ZXJWZXJzaW9uOiAnYXJuOmF3czpsYW1iZGE6dXMtZWFzdC0xOjIwOTQ5NzQwMDY5ODpsYXllcjpwaHAtNzQ6NTAnLFxuICAgICAgY29uc29sZUxheWVyVmVyc2lvbjogJ2Fybjphd3M6bGFtYmRhOnVzLWVhc3QtMToyMDk0OTc0MDA2OTg6bGF5ZXI6Y29uc29sZTo2NCcsXG4gICAgICBsYW1iZGFDb2RlUGF0aDogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2NvZGViYXNlJyksXG4gICAgICB2cGMsXG4gICAgICBkYXRhYmFzZUNvbmZpZzoge1xuICAgICAgICB3cml0ZXJFbmRwb2ludDogZGIucmRzUHJveHkhLmVuZHBvaW50LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQoc3RhY2ssICdSRFNQcm94eUVuZHBvaW50JywgeyB2YWx1ZTogZGIucmRzUHJveHkhLmVuZHBvaW50IH0pO1xuICAgIG5ldyBDZm5PdXRwdXQoc3RhY2ssICdEQk1hc3RlclVzZXInLCB7IHZhbHVlOiBkYi5tYXN0ZXJVc2VyIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQoc3RhY2ssICdEQk1hc3RlclBhc3N3b3JkU2VjcmV0JywgeyB2YWx1ZTogZGIubWFzdGVyUGFzc3dvcmQuc2VjcmV0QXJuIH0pO1xuXG4gICAgdGhpcy5zdGFjayA9IFtzdGFja107XG4gIH1cbn1cblxuLy8gcnVuIHRoZSBpbnRlZyB0ZXN0aW5nXG5uZXcgSW50ZWdUZXN0aW5nKCk7XG4iXX0=