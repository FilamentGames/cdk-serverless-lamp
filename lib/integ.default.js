"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegTesting = void 0;
const path = require("path");
const aws_cdk_lib_1 = require("aws-cdk-lib");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZWcuZGVmYXVsdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9pbnRlZy5kZWZhdWx0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDZCQUE2QjtBQUM3Qiw2Q0FJcUI7QUFDckIsbUNBQXVGO0FBRXZGLE1BQWEsWUFBWTtJQUd2QjtRQUNFLE1BQU0sR0FBRyxHQUFHLElBQUksaUJBQUcsRUFBRSxDQUFDO1FBQ3RCLE1BQU0sR0FBRyxHQUFHO1lBQ1YsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCO1lBQ3RDLE9BQU8sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQjtTQUN6QyxDQUFDO1FBRUYsTUFBTSxLQUFLLEdBQUcsSUFBSSxtQkFBSyxDQUFDLEdBQUcsRUFBRSxlQUFlLEVBQUUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBRXZELE1BQU0sR0FBRyxHQUFHLElBQUkscUJBQUcsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFckUsc0VBQXNFO1FBQ3RFLE1BQU0sRUFBRSxHQUFHLElBQUksdUJBQWUsQ0FBQyxLQUFLLEVBQUUsaUJBQWlCLEVBQUU7WUFDdkQsZUFBZSxFQUFFO2dCQUNmLE1BQU0sRUFBRSxxQkFBRyxDQUFDLHFCQUFxQixDQUFDLFdBQVcsQ0FBQztvQkFDNUMsT0FBTyxFQUFFLHFCQUFHLENBQUMsd0JBQXdCLENBQUMsVUFBVTtpQkFDakQsQ0FBQztnQkFDRixhQUFhLEVBQUU7b0JBQ2IsR0FBRztvQkFDSCxZQUFZLEVBQUUsSUFBSSxxQkFBRyxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUM7aUJBQy9DO2dCQUNELFNBQVMsRUFBRSxDQUFDO2FBQ2I7WUFDRCxRQUFRLEVBQUUsSUFBSTtTQUNmLENBQUMsQ0FBQztRQUVILHdCQUF3QjtRQUN4QixJQUFJLHlCQUFpQixDQUFDLEtBQUssRUFBRSxtQkFBbUIsRUFBRTtZQUNoRCxnQkFBZ0IsRUFBRSxnRUFBZ0U7WUFDbEYsY0FBYyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLGFBQWEsQ0FBQztZQUNuRCxHQUFHO1lBQ0gsY0FBYyxFQUFFO2dCQUNkLGNBQWMsRUFBRSxFQUFFLENBQUMsUUFBUyxDQUFDLFFBQVE7YUFDdEM7U0FDRixDQUFDLENBQUM7UUFFSCwrQkFBK0I7UUFDL0IsSUFBSSxnQ0FBd0IsQ0FBQyxLQUFLLEVBQUUsMEJBQTBCLEVBQUU7WUFDOUQsZUFBZSxFQUFFLHVEQUF1RDtZQUN4RSxtQkFBbUIsRUFBRSx3REFBd0Q7WUFDN0UsY0FBYyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLGFBQWEsQ0FBQztZQUNuRCxHQUFHO1lBQ0gsY0FBYyxFQUFFO2dCQUNkLGNBQWMsRUFBRSxFQUFFLENBQUMsUUFBUyxDQUFDLFFBQVE7YUFDdEM7U0FDRixDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsS0FBSyxFQUFFLGtCQUFrQixFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxRQUFTLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUMzRSxJQUFJLHVCQUFTLENBQUMsS0FBSyxFQUFFLGNBQWMsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUMvRCxJQUFJLHVCQUFTLENBQUMsS0FBSyxFQUFFLHdCQUF3QixFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUV2RixJQUFJLENBQUMsS0FBSyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdkIsQ0FBQztDQUNGO0FBeERELG9DQXdEQztBQUVELHdCQUF3QjtBQUN4QixJQUFJLFlBQVksRUFBRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7XG4gIEFwcCwgU3RhY2ssIENmbk91dHB1dCxcbiAgYXdzX2VjMiBhcyBlYzIsXG4gIGF3c19yZHMgYXMgcmRzLFxufSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBTZXJ2ZXJsZXNzTGFyYXZlbCwgRGF0YWJhc2VDbHVzdGVyLCBTZXJ2ZXJsZXNzTGFyYXZlbENvbnNvbGUgfSBmcm9tICcuL2luZGV4JztcblxuZXhwb3J0IGNsYXNzIEludGVnVGVzdGluZyB7XG4gIHJlYWRvbmx5IHN0YWNrOiBTdGFja1tdO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIGNvbnN0IGFwcCA9IG5ldyBBcHAoKTtcbiAgICBjb25zdCBlbnYgPSB7XG4gICAgICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTixcbiAgICAgIGFjY291bnQ6IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQsXG4gICAgfTtcblxuICAgIGNvbnN0IHN0YWNrID0gbmV3IFN0YWNrKGFwcCwgJ3Rlc3Rpbmctc3RhY2snLCB7IGVudiB9KTtcblxuICAgIGNvbnN0IHZwYyA9IG5ldyBlYzIuVnBjKHN0YWNrLCAnVnBjJywgeyBtYXhBenM6IDMsIG5hdEdhdGV3YXlzOiAxIH0pO1xuXG4gICAgLy8gdGhlIERhdGFiYXNlQ2x1c3RlciBzaGFyaW5nIHRoZSBzYW1lIHZwYyB3aXRoIHRoZSBTZXJ2ZXJsZXNzTGFyYXZlbFxuICAgIGNvbnN0IGRiID0gbmV3IERhdGFiYXNlQ2x1c3RlcihzdGFjaywgJ0RhdGFiYXNlQ2x1c3RlcicsIHtcbiAgICAgIGRhdGFiYXNlT3B0aW9uczoge1xuICAgICAgICBlbmdpbmU6IHJkcy5EYXRhYmFzZUNsdXN0ZXJFbmdpbmUuYXVyb3JhTXlzcWwoe1xuICAgICAgICAgIHZlcnNpb246IHJkcy5BdXJvcmFNeXNxbEVuZ2luZVZlcnNpb24uVkVSXzJfMDhfMSxcbiAgICAgICAgfSksXG4gICAgICAgIGluc3RhbmNlUHJvcHM6IHtcbiAgICAgICAgICB2cGMsXG4gICAgICAgICAgaW5zdGFuY2VUeXBlOiBuZXcgZWMyLkluc3RhbmNlVHlwZSgndDMuc21hbGwnKSxcbiAgICAgICAgfSxcbiAgICAgICAgaW5zdGFuY2VzOiAxLFxuICAgICAgfSxcbiAgICAgIHJkc1Byb3h5OiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gdGhlIFNlcnZlcmxlc3NMYXJhdmVsXG4gICAgbmV3IFNlcnZlcmxlc3NMYXJhdmVsKHN0YWNrLCAnU2VydmVybGVzc0xhcmF2ZWwnLCB7XG4gICAgICBicmVmTGF5ZXJWZXJzaW9uOiAnYXJuOmF3czpsYW1iZGE6YXAtbm9ydGhlYXN0LTE6MjA5NDk3NDAwNjk4OmxheWVyOnBocC03NC1mcG06MTEnLFxuICAgICAgbGFtYmRhQ29kZVBhdGg6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9jb2RlYmFzZScpLFxuICAgICAgdnBjLFxuICAgICAgZGF0YWJhc2VDb25maWc6IHtcbiAgICAgICAgd3JpdGVyRW5kcG9pbnQ6IGRiLnJkc1Byb3h5IS5lbmRwb2ludCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyB0aGUgU2VydmVybGVzc0xhcmF2ZWxDb25zb2xlXG4gICAgbmV3IFNlcnZlcmxlc3NMYXJhdmVsQ29uc29sZShzdGFjaywgJ1NlcnZlcmxlc3NMYXJhdmVsQ29uc29sZScsIHtcbiAgICAgIHBocExheWVyVmVyc2lvbjogJ2Fybjphd3M6bGFtYmRhOnVzLWVhc3QtMToyMDk0OTc0MDA2OTg6bGF5ZXI6cGhwLTc0OjUwJyxcbiAgICAgIGNvbnNvbGVMYXllclZlcnNpb246ICdhcm46YXdzOmxhbWJkYTp1cy1lYXN0LTE6MjA5NDk3NDAwNjk4OmxheWVyOmNvbnNvbGU6NjQnLFxuICAgICAgbGFtYmRhQ29kZVBhdGg6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9jb2RlYmFzZScpLFxuICAgICAgdnBjLFxuICAgICAgZGF0YWJhc2VDb25maWc6IHtcbiAgICAgICAgd3JpdGVyRW5kcG9pbnQ6IGRiLnJkc1Byb3h5IS5lbmRwb2ludCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHN0YWNrLCAnUkRTUHJveHlFbmRwb2ludCcsIHsgdmFsdWU6IGRiLnJkc1Byb3h5IS5lbmRwb2ludCB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHN0YWNrLCAnREJNYXN0ZXJVc2VyJywgeyB2YWx1ZTogZGIubWFzdGVyVXNlciB9KTtcbiAgICBuZXcgQ2ZuT3V0cHV0KHN0YWNrLCAnREJNYXN0ZXJQYXNzd29yZFNlY3JldCcsIHsgdmFsdWU6IGRiLm1hc3RlclBhc3N3b3JkLnNlY3JldEFybiB9KTtcblxuICAgIHRoaXMuc3RhY2sgPSBbc3RhY2tdO1xuICB9XG59XG5cbi8vIHJ1biB0aGUgaW50ZWcgdGVzdGluZ1xubmV3IEludGVnVGVzdGluZygpO1xuIl19