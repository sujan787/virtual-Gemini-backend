# Use an official Node runtime as a parent image
FROM node:latest as build

# Set the working directory in the container
WORKDIR /app

# Install FFmpeg and sudo
RUN apt-get update && \
    apt-get install -y ffmpeg sudo && \
    apt-get clean

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install npm dependencies
RUN npm install

# Copy the rest of the application code to the container
COPY . .

# Expose the port your app runs on
EXPOSE 3000

# Command to run your app
CMD [ "npm", "start" ]
