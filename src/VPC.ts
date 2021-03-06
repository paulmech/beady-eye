import { Credentials, EC2 as AwsEC2 } from 'aws-sdk'
import { IamRole } from './IAM'
import { expect } from 'chai'

export class VPC {

    name: string
    role: IamRole 
    region: string
    lazyEc2Client?: AwsEC2
    matchingVpcId?: string

    constructor(name: string, role?: IamRole, region?: string) {
        this.name = name;
        if (role) {
          this.role = role;
        }
        if (region) {
          this.region = region
        }
    }

    async makeEc2Client() {
      const tempCreds = this.role ? await this.role.credentials() : undefined;

      // Make EC2 client from the credentials
      this.lazyEc2Client = new AwsEC2({ credentials: tempCreds, region: this.region });
      return this.lazyEc2Client;
    }

    vpcClient() {
      // Return a client (or promise of a client) on which to perform VPC-related queries.
      // Under the hood, an EC2 client is required to query VPC information
      let client = this.lazyEc2Client || this.makeEc2Client();
      return client;
    }

    reset() {
      // Reset this instance. Mainly used for testing, but will need to be called if you expect
      // that an VPC has been taken down
      this.matchingVpcId = undefined;
    }

    async shouldExist() {
      // Query the VPC via the EC2 instance
      const params = {
                        Filters: [
                          {
                            'Name': 'tag:Name',
                            'Values': [this.name]
                          } ]
                    };

      const client = await this.vpcClient();
      const result = await client.describeVpcs(params).promise();

      if (result && result.Vpcs && result.Vpcs[0]) {
        // Store matching VPC data
        this.matchingVpcId = result.Vpcs[0].VpcId
  
        return result.Vpcs.length == 1;
      } else {
        return false
      }
    }

    async shouldHaveS3Endpoint() {
      // Query that the VPC has an S3 endpoint
      // Can only satisfy this request if the VPC is available
      if (this.matchingVpcId === undefined) {
        const vpcExists = await this.shouldExist();
        if (vpcExists == false) return false;
      }

      if(this.matchingVpcId){

        const params = {
                          Filters: [
                            {
                              'Name': 'vpc-id',
                              'Values': [this.matchingVpcId]
                            },
                            {
                              'Name': 'service-name',
                              'Values': [`com.amazonaws.${this.region}.s3`]
                            }]
                      };
  
        const client = await this.vpcClient();
        const result = await client.describeVpcEndpoints(params).promise();
  
        return result !== undefined && result.VpcEndpoints && result.VpcEndpoints.length == 1;
      }else{
        return false
      }

    }

    async shouldHaveRunningBastionInstance() {
      // Query that the VPC has a running Bastion EC2 instance
      // Can only satisfy this request if the VPC is available
      if (this.matchingVpcId === undefined) {
        const vpcExists = await this.shouldExist();
        if (vpcExists == false) return false;
      }

      if(this.matchingVpcId){
        const params = {
                          Filters: [
                            {
                              'Name': 'vpc-id',
                              'Values': [this.matchingVpcId]
                            },
                            {
                              'Name': 'tag:Name',
                              'Values': ['*bastion*']
                            } ]
                      };
  
        if (this.matchingVpcId === undefined) {
          const vpcExists = await this.shouldExist();
          if (vpcExists == false) return false;
        }
  
        const client = await this.vpcClient();
        const result = await client.describeInstances(params).promise();

        if( result && result.Reservations ){
          if (result.Reservations.length == 0) return false;

          let reservation = result.Reservations[0]

          let instances = result.Reservations[0].Instances
          if(instances){
            // Check instance and status
            let queryResult = true;
            queryResult = queryResult || (instances.length == 1);
      
            const instance = instances[0];
            queryResult = queryResult || (instance.State && instance.State.Name == "running");
      
            return queryResult;
          }else{
            return false
          }
        }else{
          return false
        }
  
      }else{
        return false
      }

    }

    toString() {
        return `VPC: ${this.name}`;
    }

}


