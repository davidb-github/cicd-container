# ECS Demo
Deploy a container based application to AWS ECS using Fargate. Additionally, build CI/CD pipeline to automate deployments when new commits are made in Github.

### Prerequisites
- aws account with membership in a group w/ AdministratorAccess policy applied
- awscli installed and configured
- Docker installed and running
``` docker-machine restart```
    Probably has a new ip if machine was rebooted since last use.
``` docker-machine env ```
``` eval $(docker-machine env)```






### AWS Service Elements
- ECS
- ECR
- CodePipeline

### Demo Sections
1. Container application and ECR creation
2. Create VPC & Subnets
3. Connect all services and test
4. Build CI/CD Pipeline to automate deployment

## Section 1: Container app testing and AWS ECR creation
### Build the local image
1. Fork and clone the repo down locally.
``` git clone https://github.com/davidb-github/cicd-container.git ```
2. Build the Docker image
``` docker build -t demo1-local:latest .```
3. docker images command should show the newly built image.
``` REPOSITORY          TAG                 IMAGE ID            CREATED             SIZE ```
``` demo1-local         latest              fdf3a26dfd98        5 minutes ago       58.7MB ```
4. Issue the docker run command using the image id from the docker images command.
``` docker run -it -p 80:3000 fdf3a26dfd98```

### Push the image to Amazon ECR
1. Login to the aws console
2. Create a new ECR repository
3. Authenticate to the newly created registry.  Note: Use AWS as the --username in the docker login cmd. AWS must be all caps. This is a strange work-around on the aws side.
```  aws --region us-east-2 ecr get-login-password | docker login --username AWS --password-stdin 554309730032.dkr.ecr.us-east-2.amazonaws.com/demo1```

You will see a warning message similar to the text below.
```WARNING! Your password will be stored unencrypted in /Users/davidb/.docker/config.json.
Configure a credential helper to remove this warning. See
https://docs.docker.com/engine/reference/commandline/login/#credentials-store
```
4. build the image
```docker build -t demo1:latest .```
  Expext output similar to below.
  ```Sending build context to Docker daemon    661kB
Step 1/8 : FROM alpine:latest
 ---> a24bb4013296
Step 2/8 : RUN apk add --no-cache nodejs npm
 ---> Using cache
 ---> 4a2e74129a6b
Step 3/8 : WORKDIR /app
 ---> Using cache
 ---> 6671bfd4980d
Step 4/8 : COPY package.json /app
 ---> Using cache
 ---> ec3297c2a079
Step 5/8 : RUN npm install
 ---> Using cache
 ---> 20dfc22f0aa7
Step 6/8 : COPY . /app
 ---> Using cache
 ---> d41650bd8570
Step 7/8 : EXPOSE 3000
 ---> Using cache
 ---> dcf010d02788
Step 8/8 : CMD ["npm", "start"]
 ---> Using cache
 ---> fdf3a26dfd98
Successfully built fdf3a26dfd98
Successfully tagged demo1:latest
```
5. Tag the new docker image:  docker tag <IMAGE_NAME> <ECR_URL>
  The <IMAGE_NAME> is the tag applied in step 4.
  The <ECR_URL> is the ECR URI for the repo created in step 2.
  Add :latest to the end of <ECR_URL>
``` docker tag demo1:latest 554309730032.dkr.ecr.us-east-2.amazonaws.com/demo1:latest```

6. Push the new image to AWS ECR
   docker push <ECR_URL>/demo:latest
``` docker push 554309730032.dkr.ecr.us-east-2.amazonaws.com/demo1:latest ```

## Section 2: Create VPC & Subnets
1. Create a new VPC
- IPv4 CIDR block
10.0.0.0/16
2. Create 4 /24 in our /16 network
-  public subnet 1
    - name: demo1-public-1
    - vpc: demo1-vpc
    - az: us-east-2a
    - CIDR: 10.0.1.0/24
-  public subnet 2
    - name: demo1-public-2
    - vpc: demo1-vpc
    - az: us-east-2b
    - CIDR: 10.0.2.0/24
- private subnet 1
    - name: demo1-private-1
    - vpc: demo1-vpc
    - az: us-east-2a
    - CIDR: 10.0.3.0/24
- private subnet 2
    - name: demo1-private-2
    - vpc: demo-vpc
    - az: us-east-2b
    - CIDR: 10.0.4.0/24

The steps below create an internet gateway and route table. And then attach the internet gateway to the public route table then attach the route table to the public subnets.


3. Create Internet Gateway
    - name: demo1-igw
4. Attach demo1-igw internet gateway to VPC
 ```
 aws ec2 attach-internet-gateway --vpc-id "vpc-05d7944354db26cdb" --internet-gateway-id "igw-0065ad75ad26ed361" --region us-east-2
 ```
 5. Create public route table and attach to demo1-vpc
 -  demo1-public-rt
 6. Add the following route to demo1-public-rt.
 ```
 0.0.0.0/0 -> demo1-igw
 ```
 7. Associate demo1-public-rt to both public subnets.

 8. Create private route table and attach to demo1-vpc
 - demo1-private-rt
 9. Associate demo1-private-rt to both private subnets

 ## Section 2 Continued: Create NAT Gateway.
 The NGW will allow resources in our private subnets to communicate out to the Internet. This is needed for images that need to download dependencies before running.
 1. Create new NAT gateway
  - specify the public subnet demo1-public-1
  - Create new elastic IP:
  - Select Create NAT Gateway
2. Update demo1-private-rt route to use new NGW
  - Edit routes on demo1-private-rt
  - Add 0.0.0.0/0 route with a target of the new NGW
  - Save new route


  ## Section 2 Continued: Create Application Load Balancer
  1. Create Application Load Balancer
- Create type: Application Load Balancer
- name: demo1-alb
- IP address type: IPv4
- load balancer protocal/port: HTTP/80
- Assign Availability Zones settings.
- VPC: demo1-vpc
- AZ: us-east-2a & us-east-2b
- subnets: demo1-public-1 & demo1-public-2
2. Next Configure Security Settings.
- Create a new security group: demo1-alb-sg
  - Type: HTTP
  - Protocol: TCP
  - Port Range: 80
  - Source: custom - 0.0.0.0/0 is world wide. It's best to restrict traffic to a test range of IPs until all security groups behind the ALB are in place.
- configure routing by creating target group
- Next: Configure Routing
  - name: demo1-alb-tg
  - target type: IP - ECS allocates IPs to our defined tasks.
  - protocol/port: HTTP/80
  - health check: See docker file /health in our case.
  - Next Register Targets
    - No need to specify static IP for targets. ECS will dynamically IP the containers and register then as targets.
  - Next Review.
  - Click Create

 ## Section 3: Create ECR cluster, task and service.
 1. Create new cluster
    - name: demo1-cluster
    - create new VPC: true w/defaults
    - CloudWatch Container Insights: true
2. Create a new cluster Task definition.
    - type: Fargate
    - name: helloWorld
    - task Role: false
    - Network Mode: awsvpc
    - There is some weirdness with host ports and awsvpc mode. You may see an error when creating the task mentioning host ports. ignore it, let it create then create a new revision with the correct ports. It won't work on the first attempt but allows you to define port 3000 while using awsvpc mode on the revision.
    - Task execution Role: create new role
    - task memory: .5GB
    - task CPU: 0.25 vCPU
2. Add Container continued
    - The container name is the URI of the image created in section 1 and can be found in the ECR repo.
    - container name: helloWorld
    - Image: 554309730032.dkr.ecr.us-east-2.amazonaws.com/demo1:latest (grab the Image URI from ECR)
    - Port mappings: 3000tcp (determined from Dockerfile)
    - Click Add
    - Click Create
3. Create service
    - Launch Type: FARGATE
    - name: helloWorld
    - revision: Usually the latest - Depends on iteration of task definition.
    - Cluster: demo1-cluster
    - service-name: helloWorld-svc
    - number of tasks: 2
    - Accept min/max % deployment type defaults
    - Click Next Step
    - Select demo1-vpc by ID
    - Select private subnets so demo1-private-1 & demo1-private-1
    - Select security group.
      - We want only traffic sourced from our Application Load Balancer.
      - Select demo1-alb
    - Container name: port helloWorld:3000:3000
    - Select Add to Load Balancer
    - Container to load balance
      - Production Listerner Port: 80:HTTP
      - Target group name: demo1-alb-tg
      - Target group protocol: HTTP
      - This populates the pattern and health checks
    - Enable service discovery integration: Unchecked
    - Next Step
    - Set Auto Scaling (Optional): Accept default value of - Do not adjust service's desired count.
    - Next Step
    - Review Screen: Create Service
    - View Service
      - Ensure Desired Tasks and Running Tasks indicate 2 which is the number of task defined when creating the service.
4. Adjust Service Security Group
- Cluster:Demo1-cluster
- Service: helloWorld-svc -> Details Tab ->Network Access
- Security groups: Check the SG details. This may be a default SG. Either update the default SG or create a new one to limit the source address to only the group of the application load balancer. Example - All TCP 0-65535 source demo1-alb-sg.
- It would also be a good idea to udpate the security group inbound rule attached to the application load balancer so that it restricts trafic to source addresses used in your testing. It defaults to 0.0.0.0/0.

## Section 4: Build CI/CD Pipeline to automate deployment






// next steps:
- Reduce desired from 2 to 0 to save $




Test URL
http://demo1-alb-1606818763.us-east-2.elb.amazonaws.com



