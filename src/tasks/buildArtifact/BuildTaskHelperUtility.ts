// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { posix, win32 } from "path";
import { GenerateJarExecutor } from "./GenerateJarExecutor";
import { IExportJarStepExecutor } from "./IExportJarStepExecutor";
import { IStepMetadata } from "./IStepMetadata";
import { ResolveJavaProjectExecutor } from "./ResolveJavaProjectExecutor";
import { ResolveMainClassExecutor } from "./ResolveMainClassExecutor";

export enum ExportJarStep {
    ResolveJavaProject = "Resolve Java Project",
    // ResolveTask is a virtual step for error reporting only.
    ResolveTask = "Resolve task",
    ResolveMainClass = "Resolve main class",
    GenerateJar = "Generate Jar",
    Finish = "Finish"
}

export const stepMap: Map<ExportJarStep, IExportJarStepExecutor> = new Map<ExportJarStep, IExportJarStepExecutor>([
    [ExportJarStep.ResolveJavaProject, new ResolveJavaProjectExecutor()],
    [ExportJarStep.ResolveMainClass, new ResolveMainClassExecutor()],
    [ExportJarStep.GenerateJar, new GenerateJarExecutor()]
]);

export namespace ExportJarConstants {
    export const DEPENDENCIES: string = "dependencies";
    export const TEST_DEPENDENCIES: string = "testDependencies";
    export const COMPILE_OUTPUT: string = "compileOutput";
    export const TEST_COMPILE_OUTPUT: string = "testCompileOutput";
}

export namespace ExportJarMessages {
    export enum StepAction {
        FINDEXECUTOR = "find proper executor",
        GOBACK = "come back to previous step",
        GOAHEAD = "go to next step"
    }

    export enum Field {
        ENTRY = "Entry",
        WORKSPACEFOLDER = "Workspace folder",
        OUTPUTPATH = "Target path",
        MAINCLASS = "Main class"
    }

    export const JAVAWORKSPACES_EMPTY =
        "No Java workspace found. Please make sure there is at least one valid Java workspace folder in your workspace folders.";
    export const WORKSPACE_EMPTY =
        "No Java project found in the workspace. Please make sure your workspace contains valid Java project(s).";
    export const PROJECT_EMPTY = "No classpath found in the Java project. Please make sure your Java project is valid.";
    export const CLASSPATHS_EMPTY =
        "No valid classpath found in the export jar configuration. Please make sure your configuration contains valid classpath(s).";

    export function fieldUndefinedMessage(field: Field, currentStep: ExportJarStep): string {
        return `The value of ${field} is invalid or has not been specified properly, current step: ${currentStep}. The export jar process will exit.`;
    }

    export function stepErrorMessage(action: StepAction, currentStep: ExportJarStep): string {
        return `Cannot ${action} in the wizard, current step: ${currentStep}. The export jar process will exit.`;
    }
}

export function resetStepMetadata(resetTo: ExportJarStep, stepMetadata: IStepMetadata): void {
    if (resetTo === ExportJarStep.ResolveJavaProject) {
        stepMetadata.workspaceFolder = undefined;
        stepMetadata.projectList = [];
        stepMetadata.mainClass = undefined;
    } else if (resetTo === ExportJarStep.ResolveMainClass) {
        stepMetadata.mainClass = undefined;
    }
}

// Display error using coc.nvim's API
// window.showErrorMessage(`[Export Jar Error]: ${message}`);
// }

export function toPosixPath(inputPath: string): string {
    return inputPath.split(win32.sep).join(posix.sep);
}

export function toWinPath(inputPath: string): string {
    return inputPath.split(posix.sep).join(win32.sep);
}
