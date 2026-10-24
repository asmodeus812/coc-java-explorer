// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as path from "path";
import { Uri, window, workspace } from "coc.nvim";
import { NodeKind } from "../java/nodeData";
import { DataNode } from "../views/dataNode";
import { checkJavaQualifiedName } from "./utility";

export async function renameFile(node: DataNode): Promise<boolean> {
    if (!node.uri) {
        return false;
    }

    const oldFsPath = Uri.parse(node.uri).fsPath;
    const isJavaType = node.nodeData.kind === NodeKind.PrimaryType;
    const oldName = isJavaType ? path.parse(oldFsPath).name : path.basename(oldFsPath);
    const newName = (await window.requestInput("New name", oldName))?.trim();
    if (!newName || newName === oldName) {
        return false;
    }

    const error = isJavaType ? checkJavaQualifiedName(newName) : "";
    const newFsPath = path.join(path.dirname(oldFsPath), isJavaType ? `${newName}.java` : newName);
    if (error) {
        window.showErrorMessage(error);
        return false;
    }
    if (await fse.pathExists(newFsPath)) {
        window.showErrorMessage(`'${path.basename(newFsPath)}' already exists.`);
        return false;
    }

    await workspace.renameFile(oldFsPath, newFsPath);
    return true;
}
