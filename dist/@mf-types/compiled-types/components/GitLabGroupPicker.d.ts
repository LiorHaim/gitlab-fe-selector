import React from 'react';
interface GitLabGroupPickerProps {
    onChange: (value: string) => void;
    rawErrors?: string[];
    formData?: string;
    uiSchema?: {
        'ui:options'?: {
            allowedHosts?: string[];
            requestUserCredentials?: {
                secretsKey: string;
                additionalScopes?: {
                    gitlab?: string[];
                };
            };
        };
    };
}
export declare const GitLabGroupPicker: (props: GitLabGroupPickerProps) => React.JSX.Element;
export {};
//# sourceMappingURL=GitLabGroupPicker.d.ts.map