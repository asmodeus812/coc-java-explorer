// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fs from "fs";
import * as path from "path";
import { Uri, window } from "coc.nvim";
import { DataNode } from "../views/dataNode";

export async function deleteFiles(node: DataNode): Promise<boolean> {
    if (!node.uri) {
        return false;
    }

    const fsPath = Uri.parse(node.uri).fsPath;
    const confirmed = await window.showPrompt(`Are you sure you want to delete '${path.basename(fsPath)}'?`);
    if (!confirmed) {
        return false;
    }

    try {
        // workspace.deleteFile moves the file into the coc tmp dir (for undo), a rename that fails with EXDEV
        // when that dir is on another file system (tmpfs /tmp), so remove it in place
        await fs.promises.rm(fsPath, { recursive: true, force: true });
        return true;
    } catch (e) {
        window.showErrorMessage(`Failed to delete '${fsPath}': ${(e as Error).message}`);
        return false;
    }
}
