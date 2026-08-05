pipeline {
    agent any

    environment {
        AWS_REGION = "ap-south-1"
        AWS_ACCOUNT_ID = "431578779644"
        ECR_REPOSITORY = "stockpilot-dev-backend"
        IMAGE_NAME = "stockpilot-backend"
        IMAGE_TAG = "${BUILD_NUMBER}"
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Workspace') {
            steps {
                sh 'pwd'
                sh 'ls -la'
            }
        }

        stage('Build Docker Image') {
            steps {
                sh 'docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .'
            }
        }

        stage('Login to Amazon ECR') {
            steps {
                sh '''
                aws ecr get-login-password --region ${AWS_REGION} | \
                docker login \
                --username AWS \
                --password-stdin \
                ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
                '''
            }
        }

        stage('Tag Docker Image') {
            steps {
                sh '''
                docker tag \
                ${IMAGE_NAME}:${IMAGE_TAG} \
                ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:${IMAGE_TAG}
                '''
            }
        }
        stage('Push Docker Image') {
    steps {
        sh '''
        docker push \
        ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:${IMAGE_TAG}
        '''
    }
}
stage('Download Task Definition') {
    steps {
        sh '''
        aws ecs describe-task-definition \
        --task-definition stockpilot-dev-backend \
        --query taskDefinition \
        > task-definition.json
        '''
    }
}
stage('Prepare Task Definition') {
    steps {
        sh '''
        jq '
        del(
          .taskDefinitionArn,
          .revision,
          .status,
          .requiresAttributes,
          .compatibilities,
          .registeredAt,
          .registeredBy
        )
        | .containerDefinitions[0].image =
        "'${AWS_ACCOUNT_ID}'.dkr.ecr.'${AWS_REGION}'.amazonaws.com/'${ECR_REPOSITORY}':'${IMAGE_TAG}'"
        ' task-definition.json > new-task-definition.json
        '''
    }
}
stage('Register Task Definition') {
    steps {
        sh '''
        aws ecs register-task-definition \
        --cli-input-json file://new-task-definition.json
        '''
    }
}
stage('Update ECS Service') {
    steps {
        sh '''
        aws ecs update-service \
        --cluster stockpilot-dev-ecs-cluster \
        --service stockpilot-dev-backend-service \
        --task-definition stockpilot-dev-backend \
        --force-new-deployment
        '''
    }
}
    }
}