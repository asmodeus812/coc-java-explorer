#!/bin/bash

echo "Cloning server sources"
git clone https://github.com/microsoft/vscode-java-dependency.git

echo "Building server artifacts"
cd vscode-java-dependency/scripts || exit
npm install
npm run build-server

cd .. || exit
echo "Copying server artifacts"
rm -rf ../server && cp -rf server ..

echo "Cleaning resources"
rm -rf ../vscode-java-dependency
