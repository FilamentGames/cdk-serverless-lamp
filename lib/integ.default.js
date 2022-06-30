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
            laravelPath: path.join(__dirname, '../codebase'),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZWcuZGVmYXVsdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9pbnRlZy5kZWZhdWx0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDZCQUE2QjtBQUM3Qiw2Q0FJcUI7QUFDckIsbUNBQTZEO0FBRTdELE1BQWEsWUFBWTtJQUd2QjtRQUNFLE1BQU0sR0FBRyxHQUFHLElBQUksaUJBQUcsRUFBRSxDQUFDO1FBQ3RCLE1BQU0sR0FBRyxHQUFHO1lBQ1YsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCO1lBQ3RDLE9BQU8sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQjtTQUN6QyxDQUFDO1FBRUYsTUFBTSxLQUFLLEdBQUcsSUFBSSxtQkFBSyxDQUFDLEdBQUcsRUFBRSxlQUFlLEVBQUUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBRXZELE1BQU0sR0FBRyxHQUFHLElBQUkscUJBQUcsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFckUsc0VBQXNFO1FBQ3RFLE1BQU0sRUFBRSxHQUFHLElBQUksdUJBQWUsQ0FBQyxLQUFLLEVBQUUsaUJBQWlCLEVBQUU7WUFDdkQsZUFBZSxFQUFFO2dCQUNmLE1BQU0sRUFBRSxxQkFBRyxDQUFDLHFCQUFxQixDQUFDLFdBQVcsQ0FBQztvQkFDNUMsT0FBTyxFQUFFLHFCQUFHLENBQUMsd0JBQXdCLENBQUMsVUFBVTtpQkFDakQsQ0FBQztnQkFDRixhQUFhLEVBQUU7b0JBQ2IsR0FBRztvQkFDSCxZQUFZLEVBQUUsSUFBSSxxQkFBRyxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUM7aUJBQy9DO2dCQUNELFNBQVMsRUFBRSxDQUFDO2FBQ2I7WUFDRCxRQUFRLEVBQUUsSUFBSTtTQUNmLENBQUMsQ0FBQztRQUVILHdCQUF3QjtRQUN4QixJQUFJLHlCQUFpQixDQUFDLEtBQUssRUFBRSxtQkFBbUIsRUFBRTtZQUNoRCxnQkFBZ0IsRUFBRSxnRUFBZ0U7WUFDbEYsV0FBVyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLGFBQWEsQ0FBQztZQUNoRCxHQUFHO1lBQ0gsY0FBYyxFQUFFO2dCQUNkLGNBQWMsRUFBRSxFQUFFLENBQUMsUUFBUyxDQUFDLFFBQVE7YUFDdEM7U0FDRixDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsS0FBSyxFQUFFLGtCQUFrQixFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxRQUFTLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUMzRSxJQUFJLHVCQUFTLENBQUMsS0FBSyxFQUFFLGNBQWMsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUMvRCxJQUFJLHVCQUFTLENBQUMsS0FBSyxFQUFFLHdCQUF3QixFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUV2RixJQUFJLENBQUMsS0FBSyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdkIsQ0FBQztDQUNGO0FBN0NELG9DQTZDQztBQUVELHdCQUF3QjtBQUN4QixJQUFJLFlBQVksRUFBRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7XG4gIEFwcCwgU3RhY2ssIENmbk91dHB1dCxcbiAgYXdzX2VjMiBhcyBlYzIsXG4gIGF3c19yZHMgYXMgcmRzLFxufSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBTZXJ2ZXJsZXNzTGFyYXZlbCwgRGF0YWJhc2VDbHVzdGVyIH0gZnJvbSAnLi9pbmRleCc7XG5cbmV4cG9ydCBjbGFzcyBJbnRlZ1Rlc3Rpbmcge1xuICByZWFkb25seSBzdGFjazogU3RhY2tbXTtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBjb25zdCBhcHAgPSBuZXcgQXBwKCk7XG4gICAgY29uc3QgZW52ID0ge1xuICAgICAgcmVnaW9uOiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9SRUdJT04sXG4gICAgICBhY2NvdW50OiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5ULFxuICAgIH07XG5cbiAgICBjb25zdCBzdGFjayA9IG5ldyBTdGFjayhhcHAsICd0ZXN0aW5nLXN0YWNrJywgeyBlbnYgfSk7XG5cbiAgICBjb25zdCB2cGMgPSBuZXcgZWMyLlZwYyhzdGFjaywgJ1ZwYycsIHsgbWF4QXpzOiAzLCBuYXRHYXRld2F5czogMSB9KTtcblxuICAgIC8vIHRoZSBEYXRhYmFzZUNsdXN0ZXIgc2hhcmluZyB0aGUgc2FtZSB2cGMgd2l0aCB0aGUgU2VydmVybGVzc0xhcmF2ZWxcbiAgICBjb25zdCBkYiA9IG5ldyBEYXRhYmFzZUNsdXN0ZXIoc3RhY2ssICdEYXRhYmFzZUNsdXN0ZXInLCB7XG4gICAgICBkYXRhYmFzZU9wdGlvbnM6IHtcbiAgICAgICAgZW5naW5lOiByZHMuRGF0YWJhc2VDbHVzdGVyRW5naW5lLmF1cm9yYU15c3FsKHtcbiAgICAgICAgICB2ZXJzaW9uOiByZHMuQXVyb3JhTXlzcWxFbmdpbmVWZXJzaW9uLlZFUl8yXzA4XzEsXG4gICAgICAgIH0pLFxuICAgICAgICBpbnN0YW5jZVByb3BzOiB7XG4gICAgICAgICAgdnBjLFxuICAgICAgICAgIGluc3RhbmNlVHlwZTogbmV3IGVjMi5JbnN0YW5jZVR5cGUoJ3QzLnNtYWxsJyksXG4gICAgICAgIH0sXG4gICAgICAgIGluc3RhbmNlczogMSxcbiAgICAgIH0sXG4gICAgICByZHNQcm94eTogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIHRoZSBTZXJ2ZXJsZXNzTGFyYXZlbFxuICAgIG5ldyBTZXJ2ZXJsZXNzTGFyYXZlbChzdGFjaywgJ1NlcnZlcmxlc3NMYXJhdmVsJywge1xuICAgICAgYnJlZkxheWVyVmVyc2lvbjogJ2Fybjphd3M6bGFtYmRhOmFwLW5vcnRoZWFzdC0xOjIwOTQ5NzQwMDY5ODpsYXllcjpwaHAtNzQtZnBtOjExJyxcbiAgICAgIGxhcmF2ZWxQYXRoOiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vY29kZWJhc2UnKSxcbiAgICAgIHZwYyxcbiAgICAgIGRhdGFiYXNlQ29uZmlnOiB7XG4gICAgICAgIHdyaXRlckVuZHBvaW50OiBkYi5yZHNQcm94eSEuZW5kcG9pbnQsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dChzdGFjaywgJ1JEU1Byb3h5RW5kcG9pbnQnLCB7IHZhbHVlOiBkYi5yZHNQcm94eSEuZW5kcG9pbnQgfSk7XG4gICAgbmV3IENmbk91dHB1dChzdGFjaywgJ0RCTWFzdGVyVXNlcicsIHsgdmFsdWU6IGRiLm1hc3RlclVzZXIgfSk7XG4gICAgbmV3IENmbk91dHB1dChzdGFjaywgJ0RCTWFzdGVyUGFzc3dvcmRTZWNyZXQnLCB7IHZhbHVlOiBkYi5tYXN0ZXJQYXNzd29yZC5zZWNyZXRBcm4gfSk7XG5cbiAgICB0aGlzLnN0YWNrID0gW3N0YWNrXTtcbiAgfVxufVxuXG4vLyBydW4gdGhlIGludGVnIHRlc3Rpbmdcbm5ldyBJbnRlZ1Rlc3RpbmcoKTtcbiJdfQ==