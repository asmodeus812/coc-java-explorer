// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as path from "path";
import { Uri, window } from "coc.nvim";
import { NodeKind } from "../java/nodeData";
import { DataNode } from "../views/dataNode";
import { checkJavaQualifiedName } from "./utility";

function packageOf(node: DataNode): string {
    return node.nodeData.kind === NodeKind.Package ? node.nodeData.name : "";
}

export async function newJavaClass(node: DataNode): Promise<boolean> {
    if (!node.uri) {
        return false;
    }

    const className = (await window.requestInput("Input the class name"))?.trim();
    if (!className) {
        return false;
    }

    const error = className.includes(".") ? "Invalid Java class name." : checkJavaQualifiedName(className);
    const filePath = path.join(Uri.parse(node.uri).fsPath, `${className}.java`);
    if (error) {
        window.showErrorMessage(error);
        return false;
    }
    if (await fse.pathExists(filePath)) {
        window.showErrorMessage(`Java file ${className}.java already exists.`);
        return false;
    }

    const packageName = packageOf(node);
    const lines = packageName ? [`package ${packageName};`, ""] : [];
    lines.push(`public class ${className} {`, "", "}", "");
    await fse.outputFile(filePath, lines.join("\n"));
    return true;
}

export async function newPackage(node: DataNode): Promise<boolean> {
    if (!node.uri) {
        return false;
    }

    const packageName = packageOf(node);
    const defaultValue = packageName ? `${packageName}.` : "";
    const newName = (await window.requestInput("Input the package name", defaultValue))?.trim();
    if (!newName) {
        return false;
    }

    // the folder of a package node is nested in the package root, take the root from it
    const nodePath = Uri.parse(node.uri).fsPath;
    const rootPath = packageName ? nodePath.slice(0, nodePath.length - packageName.length - 1) : nodePath;
    const folder = path.join(rootPath, ...newName.split("."));
    const error = checkJavaQualifiedName(newName);
    if (error) {
        window.showErrorMessage(error);
        return false;
    }
    if (await fse.pathExists(folder)) {
        window.showErrorMessage(`Package ${newName} already exists.`);
        return false;
    }

    await fse.mkdirs(folder);
    return true;
}
