// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import { Jdtls } from "../../java/jdtls";
import { IExportJarStepExecutor } from "./IExportJarStepExecutor";
import { IStepMetadata } from "./IStepMetadata";
import { ExportJarMessages, ExportJarStep } from "./BuildTaskHelperUtility";
import { window } from "coc.nvim";

export class ResolveMainClassExecutor implements IExportJarStepExecutor {
    private static getName(data: IMainClassInfo) {
        return data.name.substring(data.name.lastIndexOf(".") + 1);
    }

    private readonly currentStep: ExportJarStep = ExportJarStep.ResolveMainClass;

    public async execute(stepMetadata: IStepMetadata): Promise<boolean> {
        if (stepMetadata.mainClass !== undefined) {
            return true;
        }
        return this.resolveMainClass(stepMetadata);
    }

    private async resolveMainClass(stepMetadata: IStepMetadata): Promise<boolean> {
        if (!stepMetadata.workspaceFolder) {
            throw new Error(ExportJarMessages.fieldUndefinedMessage(ExportJarMessages.Field.WORKSPACEFOLDER, this.currentStep));
        }
        const mainClasses: IMainClassInfo[] = await Jdtls.getMainClasses(stepMetadata.workspaceFolder.uri.toString());
        if (_.isEmpty(mainClasses)) {
            stepMetadata.mainClass = "";
            return true;
        }
        if (mainClasses.length === 1) {
            stepMetadata.mainClass = mainClasses[0].name;
            stepMetadata.steps.push(ExportJarStep.ResolveMainClass);
            return true;
        }
        const items = mainClasses.map((mc) => ({
            label: ResolveMainClassExecutor.getName(mc),
            description: mc.name
        }));
        items.push({ label: "<without main class>", description: "" });
        const picked = await window.showQuickPick(items, { title: "Select the main class", canPickMany: false, matchOnDescription: true });
        if (!picked || picked === undefined) {
            return false;
        }
        if (picked.label === "<without main class>") {
            stepMetadata.mainClass = "";
            stepMetadata.steps.push(ExportJarStep.ResolveMainClass);
            return true;
        }
        stepMetadata.mainClass = picked.description || "";
        stepMetadata.steps.push(ExportJarStep.ResolveMainClass);
        return true;
    }
}

export interface IMainClassInfo {
    name: string;
    path: string;
}
