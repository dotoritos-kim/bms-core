// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type Schema = string | number | Function | Record<string, unknown>;

export interface Façade<T> {
    (value: T): T;
    validate(value: T): void;
}

function validate(schema: Schema, value: unknown): void {
    if (schema === Number) schema = 'number';
    if (schema === String) schema = 'string';

    if (typeof schema === 'string') {
        if (typeof value !== schema) {
            throw new Error(`Value should be of type ${schema}`);
        }
    } else if (typeof schema === 'function') {
        const schemaWithValidate = schema as { validate?: (v: unknown) => void; name: string };
        if (typeof schemaWithValidate.validate === 'function') {
            schemaWithValidate.validate(value);
        } else if (!(value instanceof (schema as new (...args: unknown[]) => unknown))) {
            throw new Error(`Value should be an instance of ${schema.name}`);
        }
    } else if (typeof schema === 'object') {
        if (!value) throw new Error('Value should be an object');
        validateObject(schema, value as Record<string, unknown>);
    } else {
        throw new Error('Invalid schema');
    }
}

function validateObject(schema: Record<string, unknown>, object: Record<string, unknown>): void {
    for (const prop in schema) {
        const schemaValue = schema[prop] as Schema & { _isMaybe?: boolean };
        const isMaybe = schemaValue && typeof schemaValue === 'function' && schemaValue._isMaybe;

        if (!(prop in object)) {
            // Skip validation for optional (maybe) properties that are not present
            if (isMaybe) continue;
            throw new Error(`Missing property: "${prop}"`);
        }
        try {
            validate(schemaValue, object[prop]);
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            throw new Error(`Error in property "${prop}": ${message}`);
        }
    }
}

function DataStructure<T>(...schemas: Schema[]): Façade<T> {
    const Constructor = function (object: T): T {
        Constructor.validate(object);
        return object;
    } as Façade<T>;

    Constructor.validate = (object: T) => {
        for (const schema of schemas) {
            validate(schema, object);
        }
    };

    return Constructor;
}

DataStructure.maybe = function maybe<T>(schema: Schema): Façade<T | null | undefined> & { _isMaybe: boolean } {
    const MaybeValidator = function (object: T | null | undefined): T | null | undefined {
        MaybeValidator.validate(object);
        return object;
    } as Façade<T | null | undefined> & { _isMaybe: boolean };

    MaybeValidator.validate = (value: T | null | undefined) => {
        if (value === null || value === undefined) return;
        validate(schema, value);
    };

    // Mark as optional so validateObject can skip missing properties
    MaybeValidator._isMaybe = true;

    return MaybeValidator;
};

export default DataStructure;
