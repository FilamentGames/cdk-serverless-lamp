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
            vpc,
            instanceType: new aws_cdk_lib_1.aws_ec2.InstanceType('t3.small'),
            rdsProxy: true,
            instanceCapacity: 1,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZWcuZGVmYXVsdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9pbnRlZy5kZWZhdWx0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDZCQUE2QjtBQUM3Qiw2Q0FHcUI7QUFDckIsbUNBQTZEO0FBRTdELE1BQWEsWUFBWTtJQUd2QjtRQUNFLE1BQU0sR0FBRyxHQUFHLElBQUksaUJBQUcsRUFBRSxDQUFDO1FBQ3RCLE1BQU0sR0FBRyxHQUFHO1lBQ1YsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCO1lBQ3RDLE9BQU8sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQjtTQUN6QyxDQUFDO1FBRUYsTUFBTSxLQUFLLEdBQUcsSUFBSSxtQkFBSyxDQUFDLEdBQUcsRUFBRSxlQUFlLEVBQUUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBRXZELE1BQU0sR0FBRyxHQUFHLElBQUkscUJBQUcsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFckUsc0VBQXNFO1FBQ3RFLE1BQU0sRUFBRSxHQUFHLElBQUksdUJBQWUsQ0FBQyxLQUFLLEVBQUUsaUJBQWlCLEVBQUU7WUFDdkQsR0FBRztZQUNILFlBQVksRUFBRSxJQUFJLHFCQUFHLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQztZQUM5QyxRQUFRLEVBQUUsSUFBSTtZQUNkLGdCQUFnQixFQUFFLENBQUM7U0FDcEIsQ0FBQyxDQUFDO1FBRUgsd0JBQXdCO1FBQ3hCLElBQUkseUJBQWlCLENBQUMsS0FBSyxFQUFFLG1CQUFtQixFQUFFO1lBQ2hELGdCQUFnQixFQUFFLGdFQUFnRTtZQUNsRixXQUFXLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsYUFBYSxDQUFDO1lBQ2hELEdBQUc7WUFDSCxjQUFjLEVBQUU7Z0JBQ2QsY0FBYyxFQUFFLEVBQUUsQ0FBQyxRQUFTLENBQUMsUUFBUTthQUN0QztTQUNGLENBQUMsQ0FBQztRQUVILElBQUksdUJBQVMsQ0FBQyxLQUFLLEVBQUUsa0JBQWtCLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLFFBQVMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQzNFLElBQUksdUJBQVMsQ0FBQyxLQUFLLEVBQUUsY0FBYyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQy9ELElBQUksdUJBQVMsQ0FBQyxLQUFLLEVBQUUsd0JBQXdCLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBRXZGLElBQUksQ0FBQyxLQUFLLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN2QixDQUFDO0NBQ0Y7QUF0Q0Qsb0NBc0NDO0FBRUQsd0JBQXdCO0FBQ3hCLElBQUksWUFBWSxFQUFFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHtcbiAgQXBwLCBTdGFjaywgQ2ZuT3V0cHV0LFxuICBhd3NfZWMyIGFzIGVjMixcbn0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgU2VydmVybGVzc0xhcmF2ZWwsIERhdGFiYXNlQ2x1c3RlciB9IGZyb20gJy4vaW5kZXgnO1xuXG5leHBvcnQgY2xhc3MgSW50ZWdUZXN0aW5nIHtcbiAgcmVhZG9ubHkgc3RhY2s6IFN0YWNrW107XG5cbiAgY29uc3RydWN0b3IoKSB7XG4gICAgY29uc3QgYXBwID0gbmV3IEFwcCgpO1xuICAgIGNvbnN0IGVudiA9IHtcbiAgICAgIHJlZ2lvbjogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfUkVHSU9OLFxuICAgICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICB9O1xuXG4gICAgY29uc3Qgc3RhY2sgPSBuZXcgU3RhY2soYXBwLCAndGVzdGluZy1zdGFjaycsIHsgZW52IH0pO1xuXG4gICAgY29uc3QgdnBjID0gbmV3IGVjMi5WcGMoc3RhY2ssICdWcGMnLCB7IG1heEF6czogMywgbmF0R2F0ZXdheXM6IDEgfSk7XG5cbiAgICAvLyB0aGUgRGF0YWJhc2VDbHVzdGVyIHNoYXJpbmcgdGhlIHNhbWUgdnBjIHdpdGggdGhlIFNlcnZlcmxlc3NMYXJhdmVsXG4gICAgY29uc3QgZGIgPSBuZXcgRGF0YWJhc2VDbHVzdGVyKHN0YWNrLCAnRGF0YWJhc2VDbHVzdGVyJywge1xuICAgICAgdnBjLFxuICAgICAgaW5zdGFuY2VUeXBlOiBuZXcgZWMyLkluc3RhbmNlVHlwZSgndDMuc21hbGwnKSxcbiAgICAgIHJkc1Byb3h5OiB0cnVlLFxuICAgICAgaW5zdGFuY2VDYXBhY2l0eTogMSxcbiAgICB9KTtcblxuICAgIC8vIHRoZSBTZXJ2ZXJsZXNzTGFyYXZlbFxuICAgIG5ldyBTZXJ2ZXJsZXNzTGFyYXZlbChzdGFjaywgJ1NlcnZlcmxlc3NMYXJhdmVsJywge1xuICAgICAgYnJlZkxheWVyVmVyc2lvbjogJ2Fybjphd3M6bGFtYmRhOmFwLW5vcnRoZWFzdC0xOjIwOTQ5NzQwMDY5ODpsYXllcjpwaHAtNzQtZnBtOjExJyxcbiAgICAgIGxhcmF2ZWxQYXRoOiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vY29kZWJhc2UnKSxcbiAgICAgIHZwYyxcbiAgICAgIGRhdGFiYXNlQ29uZmlnOiB7XG4gICAgICAgIHdyaXRlckVuZHBvaW50OiBkYi5yZHNQcm94eSEuZW5kcG9pbnQsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dChzdGFjaywgJ1JEU1Byb3h5RW5kcG9pbnQnLCB7IHZhbHVlOiBkYi5yZHNQcm94eSEuZW5kcG9pbnQgfSk7XG4gICAgbmV3IENmbk91dHB1dChzdGFjaywgJ0RCTWFzdGVyVXNlcicsIHsgdmFsdWU6IGRiLm1hc3RlclVzZXIgfSk7XG4gICAgbmV3IENmbk91dHB1dChzdGFjaywgJ0RCTWFzdGVyUGFzc3dvcmRTZWNyZXQnLCB7IHZhbHVlOiBkYi5tYXN0ZXJQYXNzd29yZC5zZWNyZXRBcm4gfSk7XG5cbiAgICB0aGlzLnN0YWNrID0gW3N0YWNrXTtcbiAgfVxufVxuXG4vLyBydW4gdGhlIGludGVnIHRlc3Rpbmdcbm5ldyBJbnRlZ1Rlc3RpbmcoKTtcbiJdfQ==