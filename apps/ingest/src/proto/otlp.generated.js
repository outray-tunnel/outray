// Generated from src/proto/otlp.proto; do not edit by hand.
// Regenerate: npm run generate:protobuf --workspace=outray-ingest
/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-mixed-operators, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars, default-case, jsdoc/require-param*/
import $protobuf from "protobufjs/minimal.js";

// Common aliases
const $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;
const $Object = $util.global.Object, $undefined = $util.global.undefined, $Error = $util.global.Error, $RangeError = $util.global.RangeError, $TypeError = $util.global.TypeError, $String = $util.global.String, $Boolean = $util.global.Boolean, $parseInt = $util.global.parseInt, $Number = $util.global.Number, $BigInt = $util.global.BigInt, $isFinite = $util.global.isFinite, $Array = $util.global.Array;

// Exported root namespace
const $root = $protobuf.roots["outrayOtlp"] || ($protobuf.roots["outrayOtlp"] = {});

export const outray = $root.outray = (() => {

    /**
     * Namespace outray.
     * @exports outray
     * @namespace
     */
    const outray = {};

    outray.otlp = (function() {

        /**
         * Namespace otlp.
         * @memberof outray
         * @namespace
         */
        const otlp = {};

        otlp.AnyValue = (function() {

            /**
             * Properties of an AnyValue.
             * @typedef {Object} outray.otlp.AnyValue.$Properties
             * @property {string|null} [stringValue] AnyValue stringValue
             * @property {boolean|null} [boolValue] AnyValue boolValue
             * @property {number|Long|null} [intValue] AnyValue intValue
             * @property {number|null} [doubleValue] AnyValue doubleValue
             * @property {outray.otlp.ArrayValue.$Properties|null} [arrayValue] AnyValue arrayValue
             * @property {outray.otlp.KeyValueList.$Properties|null} [kvlistValue] AnyValue kvlistValue
             * @property {Uint8Array|null} [bytesValue] AnyValue bytesValue
             * @property {"stringValue"|"boolValue"|"intValue"|"doubleValue"|"arrayValue"|"kvlistValue"|"bytesValue"} [value] AnyValue value
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of an AnyValue.
             * @memberof outray.otlp
             * @interface IAnyValue
             * @augments outray.otlp.AnyValue.$Properties
             * @deprecated Use outray.otlp.AnyValue.$Properties instead.
             */

            /**
             * Narrowed shape of an AnyValue.
             * @typedef {{
             *   stringValue?: string|null;
             *   boolValue?: boolean|null;
             *   intValue?: number|Long|null;
             *   doubleValue?: number|null;
             *   arrayValue?: outray.otlp.ArrayValue.$Shape|null;
             *   kvlistValue?: outray.otlp.KeyValueList.$Shape|null;
             *   bytesValue?: Uint8Array|null;
             *   $unknowns?: Array.<Uint8Array>;
             * } & (
             *   ({ value?: undefined; stringValue?: null; boolValue?: null; intValue?: null; doubleValue?: null; arrayValue?: null; kvlistValue?: null; bytesValue?: null }|{ value?: "stringValue"; stringValue: string; boolValue?: null; intValue?: null; doubleValue?: null; arrayValue?: null; kvlistValue?: null; bytesValue?: null }|{ value?: "boolValue"; stringValue?: null; boolValue: boolean; intValue?: null; doubleValue?: null; arrayValue?: null; kvlistValue?: null; bytesValue?: null }|{ value?: "intValue"; stringValue?: null; boolValue?: null; intValue: number|Long; doubleValue?: null; arrayValue?: null; kvlistValue?: null; bytesValue?: null }|{ value?: "doubleValue"; stringValue?: null; boolValue?: null; intValue?: null; doubleValue: number; arrayValue?: null; kvlistValue?: null; bytesValue?: null }|{ value?: "arrayValue"; stringValue?: null; boolValue?: null; intValue?: null; doubleValue?: null; arrayValue: outray.otlp.ArrayValue.$Shape; kvlistValue?: null; bytesValue?: null }|{ value?: "kvlistValue"; stringValue?: null; boolValue?: null; intValue?: null; doubleValue?: null; arrayValue?: null; kvlistValue: outray.otlp.KeyValueList.$Shape; bytesValue?: null }|{ value?: "bytesValue"; stringValue?: null; boolValue?: null; intValue?: null; doubleValue?: null; arrayValue?: null; kvlistValue?: null; bytesValue: Uint8Array })
             * )} outray.otlp.AnyValue.$Shape
             */

            /**
             * Constructs a new AnyValue.
             * @memberof outray.otlp
             * @classdesc Represents an AnyValue.
             * @constructor
             * @param {outray.otlp.AnyValue.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const AnyValue = function (properties) {
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * AnyValue stringValue.
             * @member {string|null|undefined} stringValue
             * @memberof outray.otlp.AnyValue
             * @instance
             */
            AnyValue.prototype.stringValue = null;

            /**
             * AnyValue boolValue.
             * @member {boolean|null|undefined} boolValue
             * @memberof outray.otlp.AnyValue
             * @instance
             */
            AnyValue.prototype.boolValue = null;

            /**
             * AnyValue intValue.
             * @member {number|Long|null|undefined} intValue
             * @memberof outray.otlp.AnyValue
             * @instance
             */
            AnyValue.prototype.intValue = null;

            /**
             * AnyValue doubleValue.
             * @member {number|null|undefined} doubleValue
             * @memberof outray.otlp.AnyValue
             * @instance
             */
            AnyValue.prototype.doubleValue = null;

            /**
             * AnyValue arrayValue.
             * @member {outray.otlp.ArrayValue.$Properties|null|undefined} arrayValue
             * @memberof outray.otlp.AnyValue
             * @instance
             */
            AnyValue.prototype.arrayValue = null;

            /**
             * AnyValue kvlistValue.
             * @member {outray.otlp.KeyValueList.$Properties|null|undefined} kvlistValue
             * @memberof outray.otlp.AnyValue
             * @instance
             */
            AnyValue.prototype.kvlistValue = null;

            /**
             * AnyValue bytesValue.
             * @member {Uint8Array|null|undefined} bytesValue
             * @memberof outray.otlp.AnyValue
             * @instance
             */
            AnyValue.prototype.bytesValue = null;

            // OneOf field names bound to virtual getters and setters
            let $oneOfFields;

            /**
             * AnyValue value.
             * @member {"stringValue"|"boolValue"|"intValue"|"doubleValue"|"arrayValue"|"kvlistValue"|"bytesValue"|undefined} value
             * @memberof outray.otlp.AnyValue
             * @instance
             */
            $Object.defineProperty(AnyValue.prototype, "value", {
                get: $util.oneOfGetter($oneOfFields = ["stringValue", "boolValue", "intValue", "doubleValue", "arrayValue", "kvlistValue", "bytesValue"]),
                set: $util.oneOfSetter($oneOfFields)
            });

            /**
             * Creates a new AnyValue instance using the specified properties.
             * @function create
             * @memberof outray.otlp.AnyValue
             * @static
             * @param {outray.otlp.AnyValue.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.AnyValue} AnyValue instance
             * @type {{
             *   (properties: outray.otlp.AnyValue.$Shape): outray.otlp.AnyValue & outray.otlp.AnyValue.$Shape;
             *   (properties?: outray.otlp.AnyValue.$Properties): outray.otlp.AnyValue;
             * }}
             */
            AnyValue.create = function(properties) {
                return new AnyValue(properties);
            };

            /**
             * Encodes the specified AnyValue message. Does not implicitly {@link outray.otlp.AnyValue.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.AnyValue
             * @static
             * @param {outray.otlp.AnyValue.$Properties} message AnyValue message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            AnyValue.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.stringValue != null && $Object.hasOwnProperty.call(message, "stringValue"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.stringValue);
                if (message.boolValue != null && $Object.hasOwnProperty.call(message, "boolValue"))
                    writer.uint32(/* id 2, wireType 0 =*/16).bool(message.boolValue);
                if (message.intValue != null && $Object.hasOwnProperty.call(message, "intValue"))
                    writer.uint32(/* id 3, wireType 0 =*/24).int64(message.intValue);
                if (message.doubleValue != null && $Object.hasOwnProperty.call(message, "doubleValue"))
                    writer.uint32(/* id 4, wireType 1 =*/33).double(message.doubleValue);
                if (message.arrayValue != null && $Object.hasOwnProperty.call(message, "arrayValue"))
                    $root.outray.otlp.ArrayValue.encode(message.arrayValue, writer.uint32(/* id 5, wireType 2 =*/42).fork(), _depth + 1).ldelim();
                if (message.kvlistValue != null && $Object.hasOwnProperty.call(message, "kvlistValue"))
                    $root.outray.otlp.KeyValueList.encode(message.kvlistValue, writer.uint32(/* id 6, wireType 2 =*/50).fork(), _depth + 1).ldelim();
                if (message.bytesValue != null && $Object.hasOwnProperty.call(message, "bytesValue"))
                    writer.uint32(/* id 7, wireType 2 =*/58).bytes(message.bytesValue);
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes an AnyValue message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.AnyValue
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.AnyValue & outray.otlp.AnyValue.$Shape} AnyValue
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            AnyValue.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.AnyValue();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            message.stringValue = reader.stringVerify();
                            message.value = "stringValue";
                            continue;
                        }
                    case 2: {
                            if (wireType !== 0)
                                break;
                            message.boolValue = reader.bool();
                            message.value = "boolValue";
                            continue;
                        }
                    case 3: {
                            if (wireType !== 0)
                                break;
                            message.intValue = reader.int64();
                            message.value = "intValue";
                            continue;
                        }
                    case 4: {
                            if (wireType !== 1)
                                break;
                            message.doubleValue = reader.double();
                            message.value = "doubleValue";
                            continue;
                        }
                    case 5: {
                            if (wireType !== 2)
                                break;
                            message.arrayValue = $root.outray.otlp.ArrayValue.decode(reader, reader.uint32(), $undefined, _depth + 1, message.arrayValue);
                            message.value = "arrayValue";
                            continue;
                        }
                    case 6: {
                            if (wireType !== 2)
                                break;
                            message.kvlistValue = $root.outray.otlp.KeyValueList.decode(reader, reader.uint32(), $undefined, _depth + 1, message.kvlistValue);
                            message.value = "kvlistValue";
                            continue;
                        }
                    case 7: {
                            if (wireType !== 2)
                                break;
                            message.bytesValue = reader.bytes();
                            message.value = "bytesValue";
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates an AnyValue message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.AnyValue
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.AnyValue} AnyValue
             */
            AnyValue.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.AnyValue)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.AnyValue: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.AnyValue();
                if (object.stringValue != null)
                    message.stringValue = $String(object.stringValue);
                if (object.boolValue != null)
                    message.boolValue = $Boolean(object.boolValue);
                if (object.intValue != null)
                    if ($util.Long)
                        message.intValue = $util.Long.fromValue(object.intValue, false);
                    else if (typeof object.intValue === "string")
                        message.intValue = $parseInt(object.intValue, 10);
                    else if (typeof object.intValue === "number")
                        message.intValue = object.intValue;
                    else if (typeof object.intValue === "object")
                        message.intValue = new $util.LongBits(object.intValue.low >>> 0, object.intValue.high >>> 0).toNumber();
                if (object.doubleValue != null)
                    message.doubleValue = $Number(object.doubleValue);
                if (object.arrayValue != null) {
                    if (!$util.isObject(object.arrayValue))
                        throw $TypeError(".outray.otlp.AnyValue.arrayValue: object expected");
                    message.arrayValue = $root.outray.otlp.ArrayValue.fromObject(object.arrayValue, _depth + 1);
                }
                if (object.kvlistValue != null) {
                    if (!$util.isObject(object.kvlistValue))
                        throw $TypeError(".outray.otlp.AnyValue.kvlistValue: object expected");
                    message.kvlistValue = $root.outray.otlp.KeyValueList.fromObject(object.kvlistValue, _depth + 1);
                }
                if (object.bytesValue != null)
                    if (typeof object.bytesValue === "string")
                        $util.base64.decode(object.bytesValue, message.bytesValue = $util.newBuffer($util.base64.length(object.bytesValue)), 0);
                    else if (object.bytesValue.length >= 0)
                        message.bytesValue = object.bytesValue;
                return message;
            };

            /**
             * Creates a plain object from an AnyValue message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.AnyValue
             * @static
             * @param {outray.otlp.AnyValue} message AnyValue
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            AnyValue.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (message.stringValue != null && $Object.hasOwnProperty.call(message, "stringValue")) {
                    object.stringValue = message.stringValue;
                    if (options.oneofs)
                        object.value = "stringValue";
                }
                if (message.boolValue != null && $Object.hasOwnProperty.call(message, "boolValue")) {
                    object.boolValue = message.boolValue;
                    if (options.oneofs)
                        object.value = "boolValue";
                }
                if (message.intValue != null && $Object.hasOwnProperty.call(message, "intValue")) {
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.intValue = typeof message.intValue === "number" ? $BigInt(message.intValue) : $util.Long.fromBits(message.intValue.low >>> 0, message.intValue.high >>> 0, false).toBigInt();
                    else if (typeof message.intValue === "number")
                        object.intValue = options.longs === $String ? $String(message.intValue) : message.intValue;
                    else
                        object.intValue = options.longs === $String ? $util.Long.prototype.toString.call(message.intValue) : options.longs === $Number ? new $util.LongBits(message.intValue.low >>> 0, message.intValue.high >>> 0).toNumber() : message.intValue;
                    if (options.oneofs)
                        object.value = "intValue";
                }
                if (message.doubleValue != null && $Object.hasOwnProperty.call(message, "doubleValue")) {
                    object.doubleValue = options.json && !$isFinite(message.doubleValue) ? $String(message.doubleValue) : message.doubleValue;
                    if (options.oneofs)
                        object.value = "doubleValue";
                }
                if (message.arrayValue != null && $Object.hasOwnProperty.call(message, "arrayValue")) {
                    object.arrayValue = $root.outray.otlp.ArrayValue.toObject(message.arrayValue, options, _depth + 1);
                    if (options.oneofs)
                        object.value = "arrayValue";
                }
                if (message.kvlistValue != null && $Object.hasOwnProperty.call(message, "kvlistValue")) {
                    object.kvlistValue = $root.outray.otlp.KeyValueList.toObject(message.kvlistValue, options, _depth + 1);
                    if (options.oneofs)
                        object.value = "kvlistValue";
                }
                if (message.bytesValue != null && $Object.hasOwnProperty.call(message, "bytesValue")) {
                    object.bytesValue = options.bytes === $String ? $util.base64.encode(message.bytesValue, 0, message.bytesValue.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.bytesValue) : message.bytesValue;
                    if (options.oneofs)
                        object.value = "bytesValue";
                }
                return object;
            };

            /**
             * Converts this AnyValue to JSON.
             * @function toJSON
             * @memberof outray.otlp.AnyValue
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            AnyValue.prototype.toJSON = function() {
                return AnyValue.toObject(this, $protobuf.util.toJSONOptions);
            };

            return AnyValue;
        })();

        otlp.ArrayValue = (function() {

            /**
             * Properties of an ArrayValue.
             * @typedef {Object} outray.otlp.ArrayValue.$Properties
             * @property {Array.<outray.otlp.AnyValue.$Properties>|null} [values] ArrayValue values
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of an ArrayValue.
             * @memberof outray.otlp
             * @interface IArrayValue
             * @augments outray.otlp.ArrayValue.$Properties
             * @deprecated Use outray.otlp.ArrayValue.$Properties instead.
             */

            /**
             * Shape of an ArrayValue.
             * @typedef {{
             *   values?: Array.<outray.otlp.AnyValue.$Shape>|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.ArrayValue.$Shape
             */

            /**
             * Constructs a new ArrayValue.
             * @memberof outray.otlp
             * @classdesc Represents an ArrayValue.
             * @constructor
             * @param {outray.otlp.ArrayValue.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const ArrayValue = function (properties) {
                this.values = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * ArrayValue values.
             * @member {Array.<outray.otlp.AnyValue.$Properties>} values
             * @memberof outray.otlp.ArrayValue
             * @instance
             */
            ArrayValue.prototype.values = $util.emptyArray;

            /**
             * Creates a new ArrayValue instance using the specified properties.
             * @function create
             * @memberof outray.otlp.ArrayValue
             * @static
             * @param {outray.otlp.ArrayValue.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.ArrayValue} ArrayValue instance
             * @type {{
             *   (properties: outray.otlp.ArrayValue.$Shape): outray.otlp.ArrayValue & outray.otlp.ArrayValue.$Shape;
             *   (properties?: outray.otlp.ArrayValue.$Properties): outray.otlp.ArrayValue;
             * }}
             */
            ArrayValue.create = function(properties) {
                return new ArrayValue(properties);
            };

            /**
             * Encodes the specified ArrayValue message. Does not implicitly {@link outray.otlp.ArrayValue.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.ArrayValue
             * @static
             * @param {outray.otlp.ArrayValue.$Properties} message ArrayValue message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ArrayValue.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.values != null && message.values.length)
                    for (let i = 0; i < message.values.length; ++i)
                        $root.outray.otlp.AnyValue.encode(message.values[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes an ArrayValue message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.ArrayValue
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.ArrayValue & outray.otlp.ArrayValue.$Shape} ArrayValue
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ArrayValue.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.ArrayValue();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            if (!(message.values && message.values.length))
                                message.values = [];
                            message.values.push($root.outray.otlp.AnyValue.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates an ArrayValue message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.ArrayValue
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.ArrayValue} ArrayValue
             */
            ArrayValue.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.ArrayValue)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.ArrayValue: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.ArrayValue();
                if (object.values) {
                    if (!$Array.isArray(object.values))
                        throw $TypeError(".outray.otlp.ArrayValue.values: array expected");
                    message.values = $Array(object.values.length);
                    for (let i = 0; i < object.values.length; ++i) {
                        if (!$util.isObject(object.values[i]))
                            throw $TypeError(".outray.otlp.ArrayValue.values: object expected");
                        message.values[i] = $root.outray.otlp.AnyValue.fromObject(object.values[i], _depth + 1);
                    }
                }
                return message;
            };

            /**
             * Creates a plain object from an ArrayValue message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.ArrayValue
             * @static
             * @param {outray.otlp.ArrayValue} message ArrayValue
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ArrayValue.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.values = [];
                if (message.values && message.values.length) {
                    object.values = $Array(message.values.length);
                    for (let j = 0; j < message.values.length; ++j)
                        object.values[j] = $root.outray.otlp.AnyValue.toObject(message.values[j], options, _depth + 1);
                }
                return object;
            };

            /**
             * Converts this ArrayValue to JSON.
             * @function toJSON
             * @memberof outray.otlp.ArrayValue
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ArrayValue.prototype.toJSON = function() {
                return ArrayValue.toObject(this, $protobuf.util.toJSONOptions);
            };

            return ArrayValue;
        })();

        otlp.KeyValueList = (function() {

            /**
             * Properties of a KeyValueList.
             * @typedef {Object} outray.otlp.KeyValueList.$Properties
             * @property {Array.<outray.otlp.KeyValue.$Properties>|null} [values] KeyValueList values
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of a KeyValueList.
             * @memberof outray.otlp
             * @interface IKeyValueList
             * @augments outray.otlp.KeyValueList.$Properties
             * @deprecated Use outray.otlp.KeyValueList.$Properties instead.
             */

            /**
             * Shape of a KeyValueList.
             * @typedef {{
             *   values?: Array.<outray.otlp.KeyValue.$Shape>|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.KeyValueList.$Shape
             */

            /**
             * Constructs a new KeyValueList.
             * @memberof outray.otlp
             * @classdesc Represents a KeyValueList.
             * @constructor
             * @param {outray.otlp.KeyValueList.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const KeyValueList = function (properties) {
                this.values = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * KeyValueList values.
             * @member {Array.<outray.otlp.KeyValue.$Properties>} values
             * @memberof outray.otlp.KeyValueList
             * @instance
             */
            KeyValueList.prototype.values = $util.emptyArray;

            /**
             * Creates a new KeyValueList instance using the specified properties.
             * @function create
             * @memberof outray.otlp.KeyValueList
             * @static
             * @param {outray.otlp.KeyValueList.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.KeyValueList} KeyValueList instance
             * @type {{
             *   (properties: outray.otlp.KeyValueList.$Shape): outray.otlp.KeyValueList & outray.otlp.KeyValueList.$Shape;
             *   (properties?: outray.otlp.KeyValueList.$Properties): outray.otlp.KeyValueList;
             * }}
             */
            KeyValueList.create = function(properties) {
                return new KeyValueList(properties);
            };

            /**
             * Encodes the specified KeyValueList message. Does not implicitly {@link outray.otlp.KeyValueList.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.KeyValueList
             * @static
             * @param {outray.otlp.KeyValueList.$Properties} message KeyValueList message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            KeyValueList.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.values != null && message.values.length)
                    for (let i = 0; i < message.values.length; ++i)
                        $root.outray.otlp.KeyValue.encode(message.values[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes a KeyValueList message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.KeyValueList
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.KeyValueList & outray.otlp.KeyValueList.$Shape} KeyValueList
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            KeyValueList.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.KeyValueList();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            if (!(message.values && message.values.length))
                                message.values = [];
                            message.values.push($root.outray.otlp.KeyValue.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates a KeyValueList message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.KeyValueList
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.KeyValueList} KeyValueList
             */
            KeyValueList.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.KeyValueList)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.KeyValueList: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.KeyValueList();
                if (object.values) {
                    if (!$Array.isArray(object.values))
                        throw $TypeError(".outray.otlp.KeyValueList.values: array expected");
                    message.values = $Array(object.values.length);
                    for (let i = 0; i < object.values.length; ++i) {
                        if (!$util.isObject(object.values[i]))
                            throw $TypeError(".outray.otlp.KeyValueList.values: object expected");
                        message.values[i] = $root.outray.otlp.KeyValue.fromObject(object.values[i], _depth + 1);
                    }
                }
                return message;
            };

            /**
             * Creates a plain object from a KeyValueList message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.KeyValueList
             * @static
             * @param {outray.otlp.KeyValueList} message KeyValueList
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            KeyValueList.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.values = [];
                if (message.values && message.values.length) {
                    object.values = $Array(message.values.length);
                    for (let j = 0; j < message.values.length; ++j)
                        object.values[j] = $root.outray.otlp.KeyValue.toObject(message.values[j], options, _depth + 1);
                }
                return object;
            };

            /**
             * Converts this KeyValueList to JSON.
             * @function toJSON
             * @memberof outray.otlp.KeyValueList
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            KeyValueList.prototype.toJSON = function() {
                return KeyValueList.toObject(this, $protobuf.util.toJSONOptions);
            };

            return KeyValueList;
        })();

        otlp.KeyValue = (function() {

            /**
             * Properties of a KeyValue.
             * @typedef {Object} outray.otlp.KeyValue.$Properties
             * @property {string|null} [key] KeyValue key
             * @property {outray.otlp.AnyValue.$Properties|null} [value] KeyValue value
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of a KeyValue.
             * @memberof outray.otlp
             * @interface IKeyValue
             * @augments outray.otlp.KeyValue.$Properties
             * @deprecated Use outray.otlp.KeyValue.$Properties instead.
             */

            /**
             * Shape of a KeyValue.
             * @typedef {{
             *   key?: string|null;
             *   value?: outray.otlp.AnyValue.$Shape|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.KeyValue.$Shape
             */

            /**
             * Constructs a new KeyValue.
             * @memberof outray.otlp
             * @classdesc Represents a KeyValue.
             * @constructor
             * @param {outray.otlp.KeyValue.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const KeyValue = function (properties) {
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * KeyValue key.
             * @member {string} key
             * @memberof outray.otlp.KeyValue
             * @instance
             */
            KeyValue.prototype.key = "";

            /**
             * KeyValue value.
             * @member {outray.otlp.AnyValue.$Properties|null|undefined} value
             * @memberof outray.otlp.KeyValue
             * @instance
             */
            KeyValue.prototype.value = null;

            /**
             * Creates a new KeyValue instance using the specified properties.
             * @function create
             * @memberof outray.otlp.KeyValue
             * @static
             * @param {outray.otlp.KeyValue.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.KeyValue} KeyValue instance
             * @type {{
             *   (properties: outray.otlp.KeyValue.$Shape): outray.otlp.KeyValue & outray.otlp.KeyValue.$Shape;
             *   (properties?: outray.otlp.KeyValue.$Properties): outray.otlp.KeyValue;
             * }}
             */
            KeyValue.create = function(properties) {
                return new KeyValue(properties);
            };

            /**
             * Encodes the specified KeyValue message. Does not implicitly {@link outray.otlp.KeyValue.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.KeyValue
             * @static
             * @param {outray.otlp.KeyValue.$Properties} message KeyValue message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            KeyValue.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.key != null && $Object.hasOwnProperty.call(message, "key") && message.key !== "")
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.key);
                if (message.value != null && $Object.hasOwnProperty.call(message, "value"))
                    $root.outray.otlp.AnyValue.encode(message.value, writer.uint32(/* id 2, wireType 2 =*/18).fork(), _depth + 1).ldelim();
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes a KeyValue message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.KeyValue
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.KeyValue & outray.otlp.KeyValue.$Shape} KeyValue
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            KeyValue.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.KeyValue();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.stringVerify()).length)
                                message.key = value;
                            else
                                delete message.key;
                            continue;
                        }
                    case 2: {
                            if (wireType !== 2)
                                break;
                            message.value = $root.outray.otlp.AnyValue.decode(reader, reader.uint32(), $undefined, _depth + 1, message.value);
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates a KeyValue message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.KeyValue
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.KeyValue} KeyValue
             */
            KeyValue.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.KeyValue)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.KeyValue: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.KeyValue();
                if (object.key != null)
                    if (typeof object.key !== "string" || object.key.length)
                        message.key = $String(object.key);
                if (object.value != null) {
                    if (!$util.isObject(object.value))
                        throw $TypeError(".outray.otlp.KeyValue.value: object expected");
                    message.value = $root.outray.otlp.AnyValue.fromObject(object.value, _depth + 1);
                }
                return message;
            };

            /**
             * Creates a plain object from a KeyValue message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.KeyValue
             * @static
             * @param {outray.otlp.KeyValue} message KeyValue
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            KeyValue.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.key = "";
                    object.value = null;
                }
                if (message.key != null && $Object.hasOwnProperty.call(message, "key"))
                    object.key = message.key;
                if (message.value != null && $Object.hasOwnProperty.call(message, "value"))
                    object.value = $root.outray.otlp.AnyValue.toObject(message.value, options, _depth + 1);
                return object;
            };

            /**
             * Converts this KeyValue to JSON.
             * @function toJSON
             * @memberof outray.otlp.KeyValue
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            KeyValue.prototype.toJSON = function() {
                return KeyValue.toObject(this, $protobuf.util.toJSONOptions);
            };

            return KeyValue;
        })();

        otlp.InstrumentationScope = (function() {

            /**
             * Properties of an InstrumentationScope.
             * @typedef {Object} outray.otlp.InstrumentationScope.$Properties
             * @property {string|null} [name] InstrumentationScope name
             * @property {string|null} [version] InstrumentationScope version
             * @property {Array.<outray.otlp.KeyValue.$Properties>|null} [attributes] InstrumentationScope attributes
             * @property {number|null} [droppedAttributesCount] InstrumentationScope droppedAttributesCount
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of an InstrumentationScope.
             * @memberof outray.otlp
             * @interface IInstrumentationScope
             * @augments outray.otlp.InstrumentationScope.$Properties
             * @deprecated Use outray.otlp.InstrumentationScope.$Properties instead.
             */

            /**
             * Shape of an InstrumentationScope.
             * @typedef {{
             *   name?: string|null;
             *   version?: string|null;
             *   attributes?: Array.<outray.otlp.KeyValue.$Shape>|null;
             *   droppedAttributesCount?: number|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.InstrumentationScope.$Shape
             */

            /**
             * Constructs a new InstrumentationScope.
             * @memberof outray.otlp
             * @classdesc Represents an InstrumentationScope.
             * @constructor
             * @param {outray.otlp.InstrumentationScope.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const InstrumentationScope = function (properties) {
                this.attributes = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * InstrumentationScope name.
             * @member {string} name
             * @memberof outray.otlp.InstrumentationScope
             * @instance
             */
            InstrumentationScope.prototype.name = "";

            /**
             * InstrumentationScope version.
             * @member {string} version
             * @memberof outray.otlp.InstrumentationScope
             * @instance
             */
            InstrumentationScope.prototype.version = "";

            /**
             * InstrumentationScope attributes.
             * @member {Array.<outray.otlp.KeyValue.$Properties>} attributes
             * @memberof outray.otlp.InstrumentationScope
             * @instance
             */
            InstrumentationScope.prototype.attributes = $util.emptyArray;

            /**
             * InstrumentationScope droppedAttributesCount.
             * @member {number} droppedAttributesCount
             * @memberof outray.otlp.InstrumentationScope
             * @instance
             */
            InstrumentationScope.prototype.droppedAttributesCount = 0;

            /**
             * Creates a new InstrumentationScope instance using the specified properties.
             * @function create
             * @memberof outray.otlp.InstrumentationScope
             * @static
             * @param {outray.otlp.InstrumentationScope.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.InstrumentationScope} InstrumentationScope instance
             * @type {{
             *   (properties: outray.otlp.InstrumentationScope.$Shape): outray.otlp.InstrumentationScope & outray.otlp.InstrumentationScope.$Shape;
             *   (properties?: outray.otlp.InstrumentationScope.$Properties): outray.otlp.InstrumentationScope;
             * }}
             */
            InstrumentationScope.create = function(properties) {
                return new InstrumentationScope(properties);
            };

            /**
             * Encodes the specified InstrumentationScope message. Does not implicitly {@link outray.otlp.InstrumentationScope.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.InstrumentationScope
             * @static
             * @param {outray.otlp.InstrumentationScope.$Properties} message InstrumentationScope message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            InstrumentationScope.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.name != null && $Object.hasOwnProperty.call(message, "name") && message.name !== "")
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.name);
                if (message.version != null && $Object.hasOwnProperty.call(message, "version") && message.version !== "")
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.version);
                if (message.attributes != null && message.attributes.length)
                    for (let i = 0; i < message.attributes.length; ++i)
                        $root.outray.otlp.KeyValue.encode(message.attributes[i], writer.uint32(/* id 3, wireType 2 =*/26).fork(), _depth + 1).ldelim();
                if (message.droppedAttributesCount != null && $Object.hasOwnProperty.call(message, "droppedAttributesCount") && message.droppedAttributesCount !== 0)
                    writer.uint32(/* id 4, wireType 0 =*/32).uint32(message.droppedAttributesCount);
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes an InstrumentationScope message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.InstrumentationScope
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.InstrumentationScope & outray.otlp.InstrumentationScope.$Shape} InstrumentationScope
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            InstrumentationScope.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.InstrumentationScope();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.stringVerify()).length)
                                message.name = value;
                            else
                                delete message.name;
                            continue;
                        }
                    case 2: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.stringVerify()).length)
                                message.version = value;
                            else
                                delete message.version;
                            continue;
                        }
                    case 3: {
                            if (wireType !== 2)
                                break;
                            if (!(message.attributes && message.attributes.length))
                                message.attributes = [];
                            message.attributes.push($root.outray.otlp.KeyValue.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 4: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.uint32())
                                message.droppedAttributesCount = value;
                            else
                                delete message.droppedAttributesCount;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates an InstrumentationScope message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.InstrumentationScope
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.InstrumentationScope} InstrumentationScope
             */
            InstrumentationScope.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.InstrumentationScope)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.InstrumentationScope: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.InstrumentationScope();
                if (object.name != null)
                    if (typeof object.name !== "string" || object.name.length)
                        message.name = $String(object.name);
                if (object.version != null)
                    if (typeof object.version !== "string" || object.version.length)
                        message.version = $String(object.version);
                if (object.attributes) {
                    if (!$Array.isArray(object.attributes))
                        throw $TypeError(".outray.otlp.InstrumentationScope.attributes: array expected");
                    message.attributes = $Array(object.attributes.length);
                    for (let i = 0; i < object.attributes.length; ++i) {
                        if (!$util.isObject(object.attributes[i]))
                            throw $TypeError(".outray.otlp.InstrumentationScope.attributes: object expected");
                        message.attributes[i] = $root.outray.otlp.KeyValue.fromObject(object.attributes[i], _depth + 1);
                    }
                }
                if (object.droppedAttributesCount != null)
                    if ($Number(object.droppedAttributesCount) !== 0)
                        message.droppedAttributesCount = object.droppedAttributesCount >>> 0;
                return message;
            };

            /**
             * Creates a plain object from an InstrumentationScope message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.InstrumentationScope
             * @static
             * @param {outray.otlp.InstrumentationScope} message InstrumentationScope
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            InstrumentationScope.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.attributes = [];
                if (options.defaults) {
                    object.name = "";
                    object.version = "";
                    object.droppedAttributesCount = 0;
                }
                if (message.name != null && $Object.hasOwnProperty.call(message, "name"))
                    object.name = message.name;
                if (message.version != null && $Object.hasOwnProperty.call(message, "version"))
                    object.version = message.version;
                if (message.attributes && message.attributes.length) {
                    object.attributes = $Array(message.attributes.length);
                    for (let j = 0; j < message.attributes.length; ++j)
                        object.attributes[j] = $root.outray.otlp.KeyValue.toObject(message.attributes[j], options, _depth + 1);
                }
                if (message.droppedAttributesCount != null && $Object.hasOwnProperty.call(message, "droppedAttributesCount"))
                    object.droppedAttributesCount = message.droppedAttributesCount;
                return object;
            };

            /**
             * Converts this InstrumentationScope to JSON.
             * @function toJSON
             * @memberof outray.otlp.InstrumentationScope
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            InstrumentationScope.prototype.toJSON = function() {
                return InstrumentationScope.toObject(this, $protobuf.util.toJSONOptions);
            };

            return InstrumentationScope;
        })();

        otlp.Resource = (function() {

            /**
             * Properties of a Resource.
             * @typedef {Object} outray.otlp.Resource.$Properties
             * @property {Array.<outray.otlp.KeyValue.$Properties>|null} [attributes] Resource attributes
             * @property {number|null} [droppedAttributesCount] Resource droppedAttributesCount
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of a Resource.
             * @memberof outray.otlp
             * @interface IResource
             * @augments outray.otlp.Resource.$Properties
             * @deprecated Use outray.otlp.Resource.$Properties instead.
             */

            /**
             * Shape of a Resource.
             * @typedef {{
             *   attributes?: Array.<outray.otlp.KeyValue.$Shape>|null;
             *   droppedAttributesCount?: number|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.Resource.$Shape
             */

            /**
             * Constructs a new Resource.
             * @memberof outray.otlp
             * @classdesc Represents a Resource.
             * @constructor
             * @param {outray.otlp.Resource.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const Resource = function (properties) {
                this.attributes = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * Resource attributes.
             * @member {Array.<outray.otlp.KeyValue.$Properties>} attributes
             * @memberof outray.otlp.Resource
             * @instance
             */
            Resource.prototype.attributes = $util.emptyArray;

            /**
             * Resource droppedAttributesCount.
             * @member {number} droppedAttributesCount
             * @memberof outray.otlp.Resource
             * @instance
             */
            Resource.prototype.droppedAttributesCount = 0;

            /**
             * Creates a new Resource instance using the specified properties.
             * @function create
             * @memberof outray.otlp.Resource
             * @static
             * @param {outray.otlp.Resource.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.Resource} Resource instance
             * @type {{
             *   (properties: outray.otlp.Resource.$Shape): outray.otlp.Resource & outray.otlp.Resource.$Shape;
             *   (properties?: outray.otlp.Resource.$Properties): outray.otlp.Resource;
             * }}
             */
            Resource.create = function(properties) {
                return new Resource(properties);
            };

            /**
             * Encodes the specified Resource message. Does not implicitly {@link outray.otlp.Resource.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.Resource
             * @static
             * @param {outray.otlp.Resource.$Properties} message Resource message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Resource.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.attributes != null && message.attributes.length)
                    for (let i = 0; i < message.attributes.length; ++i)
                        $root.outray.otlp.KeyValue.encode(message.attributes[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
                if (message.droppedAttributesCount != null && $Object.hasOwnProperty.call(message, "droppedAttributesCount") && message.droppedAttributesCount !== 0)
                    writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.droppedAttributesCount);
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes a Resource message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.Resource
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.Resource & outray.otlp.Resource.$Shape} Resource
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Resource.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.Resource();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            if (!(message.attributes && message.attributes.length))
                                message.attributes = [];
                            message.attributes.push($root.outray.otlp.KeyValue.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 2: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.uint32())
                                message.droppedAttributesCount = value;
                            else
                                delete message.droppedAttributesCount;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates a Resource message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.Resource
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.Resource} Resource
             */
            Resource.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.Resource)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.Resource: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.Resource();
                if (object.attributes) {
                    if (!$Array.isArray(object.attributes))
                        throw $TypeError(".outray.otlp.Resource.attributes: array expected");
                    message.attributes = $Array(object.attributes.length);
                    for (let i = 0; i < object.attributes.length; ++i) {
                        if (!$util.isObject(object.attributes[i]))
                            throw $TypeError(".outray.otlp.Resource.attributes: object expected");
                        message.attributes[i] = $root.outray.otlp.KeyValue.fromObject(object.attributes[i], _depth + 1);
                    }
                }
                if (object.droppedAttributesCount != null)
                    if ($Number(object.droppedAttributesCount) !== 0)
                        message.droppedAttributesCount = object.droppedAttributesCount >>> 0;
                return message;
            };

            /**
             * Creates a plain object from a Resource message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.Resource
             * @static
             * @param {outray.otlp.Resource} message Resource
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            Resource.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.attributes = [];
                if (options.defaults)
                    object.droppedAttributesCount = 0;
                if (message.attributes && message.attributes.length) {
                    object.attributes = $Array(message.attributes.length);
                    for (let j = 0; j < message.attributes.length; ++j)
                        object.attributes[j] = $root.outray.otlp.KeyValue.toObject(message.attributes[j], options, _depth + 1);
                }
                if (message.droppedAttributesCount != null && $Object.hasOwnProperty.call(message, "droppedAttributesCount"))
                    object.droppedAttributesCount = message.droppedAttributesCount;
                return object;
            };

            /**
             * Converts this Resource to JSON.
             * @function toJSON
             * @memberof outray.otlp.Resource
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            Resource.prototype.toJSON = function() {
                return Resource.toObject(this, $protobuf.util.toJSONOptions);
            };

            return Resource;
        })();

        otlp.ResourceSpans = (function() {

            /**
             * Properties of a ResourceSpans.
             * @typedef {Object} outray.otlp.ResourceSpans.$Properties
             * @property {outray.otlp.Resource.$Properties|null} [resource] ResourceSpans resource
             * @property {Array.<outray.otlp.ScopeSpans.$Properties>|null} [scopeSpans] ResourceSpans scopeSpans
             * @property {string|null} [schemaUrl] ResourceSpans schemaUrl
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of a ResourceSpans.
             * @memberof outray.otlp
             * @interface IResourceSpans
             * @augments outray.otlp.ResourceSpans.$Properties
             * @deprecated Use outray.otlp.ResourceSpans.$Properties instead.
             */

            /**
             * Shape of a ResourceSpans.
             * @typedef {{
             *   resource?: outray.otlp.Resource.$Shape|null;
             *   scopeSpans?: Array.<outray.otlp.ScopeSpans.$Shape>|null;
             *   schemaUrl?: string|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.ResourceSpans.$Shape
             */

            /**
             * Constructs a new ResourceSpans.
             * @memberof outray.otlp
             * @classdesc Represents a ResourceSpans.
             * @constructor
             * @param {outray.otlp.ResourceSpans.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const ResourceSpans = function (properties) {
                this.scopeSpans = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * ResourceSpans resource.
             * @member {outray.otlp.Resource.$Properties|null|undefined} resource
             * @memberof outray.otlp.ResourceSpans
             * @instance
             */
            ResourceSpans.prototype.resource = null;

            /**
             * ResourceSpans scopeSpans.
             * @member {Array.<outray.otlp.ScopeSpans.$Properties>} scopeSpans
             * @memberof outray.otlp.ResourceSpans
             * @instance
             */
            ResourceSpans.prototype.scopeSpans = $util.emptyArray;

            /**
             * ResourceSpans schemaUrl.
             * @member {string} schemaUrl
             * @memberof outray.otlp.ResourceSpans
             * @instance
             */
            ResourceSpans.prototype.schemaUrl = "";

            /**
             * Creates a new ResourceSpans instance using the specified properties.
             * @function create
             * @memberof outray.otlp.ResourceSpans
             * @static
             * @param {outray.otlp.ResourceSpans.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.ResourceSpans} ResourceSpans instance
             * @type {{
             *   (properties: outray.otlp.ResourceSpans.$Shape): outray.otlp.ResourceSpans & outray.otlp.ResourceSpans.$Shape;
             *   (properties?: outray.otlp.ResourceSpans.$Properties): outray.otlp.ResourceSpans;
             * }}
             */
            ResourceSpans.create = function(properties) {
                return new ResourceSpans(properties);
            };

            /**
             * Encodes the specified ResourceSpans message. Does not implicitly {@link outray.otlp.ResourceSpans.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.ResourceSpans
             * @static
             * @param {outray.otlp.ResourceSpans.$Properties} message ResourceSpans message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ResourceSpans.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.resource != null && $Object.hasOwnProperty.call(message, "resource"))
                    $root.outray.otlp.Resource.encode(message.resource, writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
                if (message.scopeSpans != null && message.scopeSpans.length)
                    for (let i = 0; i < message.scopeSpans.length; ++i)
                        $root.outray.otlp.ScopeSpans.encode(message.scopeSpans[i], writer.uint32(/* id 2, wireType 2 =*/18).fork(), _depth + 1).ldelim();
                if (message.schemaUrl != null && $Object.hasOwnProperty.call(message, "schemaUrl") && message.schemaUrl !== "")
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.schemaUrl);
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes a ResourceSpans message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.ResourceSpans
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.ResourceSpans & outray.otlp.ResourceSpans.$Shape} ResourceSpans
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ResourceSpans.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.ResourceSpans();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            message.resource = $root.outray.otlp.Resource.decode(reader, reader.uint32(), $undefined, _depth + 1, message.resource);
                            continue;
                        }
                    case 2: {
                            if (wireType !== 2)
                                break;
                            if (!(message.scopeSpans && message.scopeSpans.length))
                                message.scopeSpans = [];
                            message.scopeSpans.push($root.outray.otlp.ScopeSpans.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 3: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.stringVerify()).length)
                                message.schemaUrl = value;
                            else
                                delete message.schemaUrl;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates a ResourceSpans message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.ResourceSpans
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.ResourceSpans} ResourceSpans
             */
            ResourceSpans.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.ResourceSpans)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.ResourceSpans: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.ResourceSpans();
                if (object.resource != null) {
                    if (!$util.isObject(object.resource))
                        throw $TypeError(".outray.otlp.ResourceSpans.resource: object expected");
                    message.resource = $root.outray.otlp.Resource.fromObject(object.resource, _depth + 1);
                }
                if (object.scopeSpans) {
                    if (!$Array.isArray(object.scopeSpans))
                        throw $TypeError(".outray.otlp.ResourceSpans.scopeSpans: array expected");
                    message.scopeSpans = $Array(object.scopeSpans.length);
                    for (let i = 0; i < object.scopeSpans.length; ++i) {
                        if (!$util.isObject(object.scopeSpans[i]))
                            throw $TypeError(".outray.otlp.ResourceSpans.scopeSpans: object expected");
                        message.scopeSpans[i] = $root.outray.otlp.ScopeSpans.fromObject(object.scopeSpans[i], _depth + 1);
                    }
                }
                if (object.schemaUrl != null)
                    if (typeof object.schemaUrl !== "string" || object.schemaUrl.length)
                        message.schemaUrl = $String(object.schemaUrl);
                return message;
            };

            /**
             * Creates a plain object from a ResourceSpans message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.ResourceSpans
             * @static
             * @param {outray.otlp.ResourceSpans} message ResourceSpans
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ResourceSpans.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.scopeSpans = [];
                if (options.defaults) {
                    object.resource = null;
                    object.schemaUrl = "";
                }
                if (message.resource != null && $Object.hasOwnProperty.call(message, "resource"))
                    object.resource = $root.outray.otlp.Resource.toObject(message.resource, options, _depth + 1);
                if (message.scopeSpans && message.scopeSpans.length) {
                    object.scopeSpans = $Array(message.scopeSpans.length);
                    for (let j = 0; j < message.scopeSpans.length; ++j)
                        object.scopeSpans[j] = $root.outray.otlp.ScopeSpans.toObject(message.scopeSpans[j], options, _depth + 1);
                }
                if (message.schemaUrl != null && $Object.hasOwnProperty.call(message, "schemaUrl"))
                    object.schemaUrl = message.schemaUrl;
                return object;
            };

            /**
             * Converts this ResourceSpans to JSON.
             * @function toJSON
             * @memberof outray.otlp.ResourceSpans
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ResourceSpans.prototype.toJSON = function() {
                return ResourceSpans.toObject(this, $protobuf.util.toJSONOptions);
            };

            return ResourceSpans;
        })();

        otlp.ScopeSpans = (function() {

            /**
             * Properties of a ScopeSpans.
             * @typedef {Object} outray.otlp.ScopeSpans.$Properties
             * @property {outray.otlp.InstrumentationScope.$Properties|null} [scope] ScopeSpans scope
             * @property {Array.<outray.otlp.Span.$Properties>|null} [spans] ScopeSpans spans
             * @property {string|null} [schemaUrl] ScopeSpans schemaUrl
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of a ScopeSpans.
             * @memberof outray.otlp
             * @interface IScopeSpans
             * @augments outray.otlp.ScopeSpans.$Properties
             * @deprecated Use outray.otlp.ScopeSpans.$Properties instead.
             */

            /**
             * Shape of a ScopeSpans.
             * @typedef {{
             *   scope?: outray.otlp.InstrumentationScope.$Shape|null;
             *   spans?: Array.<outray.otlp.Span.$Shape>|null;
             *   schemaUrl?: string|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.ScopeSpans.$Shape
             */

            /**
             * Constructs a new ScopeSpans.
             * @memberof outray.otlp
             * @classdesc Represents a ScopeSpans.
             * @constructor
             * @param {outray.otlp.ScopeSpans.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const ScopeSpans = function (properties) {
                this.spans = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * ScopeSpans scope.
             * @member {outray.otlp.InstrumentationScope.$Properties|null|undefined} scope
             * @memberof outray.otlp.ScopeSpans
             * @instance
             */
            ScopeSpans.prototype.scope = null;

            /**
             * ScopeSpans spans.
             * @member {Array.<outray.otlp.Span.$Properties>} spans
             * @memberof outray.otlp.ScopeSpans
             * @instance
             */
            ScopeSpans.prototype.spans = $util.emptyArray;

            /**
             * ScopeSpans schemaUrl.
             * @member {string} schemaUrl
             * @memberof outray.otlp.ScopeSpans
             * @instance
             */
            ScopeSpans.prototype.schemaUrl = "";

            /**
             * Creates a new ScopeSpans instance using the specified properties.
             * @function create
             * @memberof outray.otlp.ScopeSpans
             * @static
             * @param {outray.otlp.ScopeSpans.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.ScopeSpans} ScopeSpans instance
             * @type {{
             *   (properties: outray.otlp.ScopeSpans.$Shape): outray.otlp.ScopeSpans & outray.otlp.ScopeSpans.$Shape;
             *   (properties?: outray.otlp.ScopeSpans.$Properties): outray.otlp.ScopeSpans;
             * }}
             */
            ScopeSpans.create = function(properties) {
                return new ScopeSpans(properties);
            };

            /**
             * Encodes the specified ScopeSpans message. Does not implicitly {@link outray.otlp.ScopeSpans.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.ScopeSpans
             * @static
             * @param {outray.otlp.ScopeSpans.$Properties} message ScopeSpans message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ScopeSpans.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.scope != null && $Object.hasOwnProperty.call(message, "scope"))
                    $root.outray.otlp.InstrumentationScope.encode(message.scope, writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
                if (message.spans != null && message.spans.length)
                    for (let i = 0; i < message.spans.length; ++i)
                        $root.outray.otlp.Span.encode(message.spans[i], writer.uint32(/* id 2, wireType 2 =*/18).fork(), _depth + 1).ldelim();
                if (message.schemaUrl != null && $Object.hasOwnProperty.call(message, "schemaUrl") && message.schemaUrl !== "")
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.schemaUrl);
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes a ScopeSpans message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.ScopeSpans
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.ScopeSpans & outray.otlp.ScopeSpans.$Shape} ScopeSpans
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ScopeSpans.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.ScopeSpans();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            message.scope = $root.outray.otlp.InstrumentationScope.decode(reader, reader.uint32(), $undefined, _depth + 1, message.scope);
                            continue;
                        }
                    case 2: {
                            if (wireType !== 2)
                                break;
                            if (!(message.spans && message.spans.length))
                                message.spans = [];
                            message.spans.push($root.outray.otlp.Span.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 3: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.stringVerify()).length)
                                message.schemaUrl = value;
                            else
                                delete message.schemaUrl;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates a ScopeSpans message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.ScopeSpans
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.ScopeSpans} ScopeSpans
             */
            ScopeSpans.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.ScopeSpans)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.ScopeSpans: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.ScopeSpans();
                if (object.scope != null) {
                    if (!$util.isObject(object.scope))
                        throw $TypeError(".outray.otlp.ScopeSpans.scope: object expected");
                    message.scope = $root.outray.otlp.InstrumentationScope.fromObject(object.scope, _depth + 1);
                }
                if (object.spans) {
                    if (!$Array.isArray(object.spans))
                        throw $TypeError(".outray.otlp.ScopeSpans.spans: array expected");
                    message.spans = $Array(object.spans.length);
                    for (let i = 0; i < object.spans.length; ++i) {
                        if (!$util.isObject(object.spans[i]))
                            throw $TypeError(".outray.otlp.ScopeSpans.spans: object expected");
                        message.spans[i] = $root.outray.otlp.Span.fromObject(object.spans[i], _depth + 1);
                    }
                }
                if (object.schemaUrl != null)
                    if (typeof object.schemaUrl !== "string" || object.schemaUrl.length)
                        message.schemaUrl = $String(object.schemaUrl);
                return message;
            };

            /**
             * Creates a plain object from a ScopeSpans message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.ScopeSpans
             * @static
             * @param {outray.otlp.ScopeSpans} message ScopeSpans
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ScopeSpans.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.spans = [];
                if (options.defaults) {
                    object.scope = null;
                    object.schemaUrl = "";
                }
                if (message.scope != null && $Object.hasOwnProperty.call(message, "scope"))
                    object.scope = $root.outray.otlp.InstrumentationScope.toObject(message.scope, options, _depth + 1);
                if (message.spans && message.spans.length) {
                    object.spans = $Array(message.spans.length);
                    for (let j = 0; j < message.spans.length; ++j)
                        object.spans[j] = $root.outray.otlp.Span.toObject(message.spans[j], options, _depth + 1);
                }
                if (message.schemaUrl != null && $Object.hasOwnProperty.call(message, "schemaUrl"))
                    object.schemaUrl = message.schemaUrl;
                return object;
            };

            /**
             * Converts this ScopeSpans to JSON.
             * @function toJSON
             * @memberof outray.otlp.ScopeSpans
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ScopeSpans.prototype.toJSON = function() {
                return ScopeSpans.toObject(this, $protobuf.util.toJSONOptions);
            };

            return ScopeSpans;
        })();

        otlp.Span = (function() {

            /**
             * Properties of a Span.
             * @typedef {Object} outray.otlp.Span.$Properties
             * @property {Uint8Array|null} [traceId] Span traceId
             * @property {Uint8Array|null} [spanId] Span spanId
             * @property {string|null} [traceState] Span traceState
             * @property {Uint8Array|null} [parentSpanId] Span parentSpanId
             * @property {string|null} [name] Span name
             * @property {outray.otlp.Span.SpanKind|null} [kind] Span kind
             * @property {number|Long|null} [startTimeUnixNano] Span startTimeUnixNano
             * @property {number|Long|null} [endTimeUnixNano] Span endTimeUnixNano
             * @property {Array.<outray.otlp.KeyValue.$Properties>|null} [attributes] Span attributes
             * @property {number|null} [droppedAttributesCount] Span droppedAttributesCount
             * @property {Array.<outray.otlp.Span.Event.$Properties>|null} [events] Span events
             * @property {number|null} [droppedEventsCount] Span droppedEventsCount
             * @property {Array.<outray.otlp.Span.Link.$Properties>|null} [links] Span links
             * @property {number|null} [droppedLinksCount] Span droppedLinksCount
             * @property {outray.otlp.Status.$Properties|null} [status] Span status
             * @property {number|null} [flags] Span flags
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of a Span.
             * @memberof outray.otlp
             * @interface ISpan
             * @augments outray.otlp.Span.$Properties
             * @deprecated Use outray.otlp.Span.$Properties instead.
             */

            /**
             * Shape of a Span.
             * @typedef {{
             *   traceId?: Uint8Array|null;
             *   spanId?: Uint8Array|null;
             *   traceState?: string|null;
             *   parentSpanId?: Uint8Array|null;
             *   name?: string|null;
             *   kind?: outray.otlp.Span.SpanKind|null;
             *   startTimeUnixNano?: number|Long|null;
             *   endTimeUnixNano?: number|Long|null;
             *   attributes?: Array.<outray.otlp.KeyValue.$Shape>|null;
             *   droppedAttributesCount?: number|null;
             *   events?: Array.<outray.otlp.Span.Event.$Shape>|null;
             *   droppedEventsCount?: number|null;
             *   links?: Array.<outray.otlp.Span.Link.$Shape>|null;
             *   droppedLinksCount?: number|null;
             *   status?: outray.otlp.Status.$Shape|null;
             *   flags?: number|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.Span.$Shape
             */

            /**
             * Constructs a new Span.
             * @memberof outray.otlp
             * @classdesc Represents a Span.
             * @constructor
             * @param {outray.otlp.Span.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const Span = function (properties) {
                this.attributes = [];
                this.events = [];
                this.links = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * Span traceId.
             * @member {Uint8Array} traceId
             * @memberof outray.otlp.Span
             * @instance
             */
            Span.prototype.traceId = $util.newBuffer([]);

            /**
             * Span spanId.
             * @member {Uint8Array} spanId
             * @memberof outray.otlp.Span
             * @instance
             */
            Span.prototype.spanId = $util.newBuffer([]);

            /**
             * Span traceState.
             * @member {string} traceState
             * @memberof outray.otlp.Span
             * @instance
             */
            Span.prototype.traceState = "";

            /**
             * Span parentSpanId.
             * @member {Uint8Array} parentSpanId
             * @memberof outray.otlp.Span
             * @instance
             */
            Span.prototype.parentSpanId = $util.newBuffer([]);

            /**
             * Span name.
             * @member {string} name
             * @memberof outray.otlp.Span
             * @instance
             */
            Span.prototype.name = "";

            /**
             * Span kind.
             * @member {outray.otlp.Span.SpanKind} kind
             * @memberof outray.otlp.Span
             * @instance
             */
            Span.prototype.kind = 0;

            /**
             * Span startTimeUnixNano.
             * @member {number|Long} startTimeUnixNano
             * @memberof outray.otlp.Span
             * @instance
             */
            Span.prototype.startTimeUnixNano = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * Span endTimeUnixNano.
             * @member {number|Long} endTimeUnixNano
             * @memberof outray.otlp.Span
             * @instance
             */
            Span.prototype.endTimeUnixNano = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * Span attributes.
             * @member {Array.<outray.otlp.KeyValue.$Properties>} attributes
             * @memberof outray.otlp.Span
             * @instance
             */
            Span.prototype.attributes = $util.emptyArray;

            /**
             * Span droppedAttributesCount.
             * @member {number} droppedAttributesCount
             * @memberof outray.otlp.Span
             * @instance
             */
            Span.prototype.droppedAttributesCount = 0;

            /**
             * Span events.
             * @member {Array.<outray.otlp.Span.Event.$Properties>} events
             * @memberof outray.otlp.Span
             * @instance
             */
            Span.prototype.events = $util.emptyArray;

            /**
             * Span droppedEventsCount.
             * @member {number} droppedEventsCount
             * @memberof outray.otlp.Span
             * @instance
             */
            Span.prototype.droppedEventsCount = 0;

            /**
             * Span links.
             * @member {Array.<outray.otlp.Span.Link.$Properties>} links
             * @memberof outray.otlp.Span
             * @instance
             */
            Span.prototype.links = $util.emptyArray;

            /**
             * Span droppedLinksCount.
             * @member {number} droppedLinksCount
             * @memberof outray.otlp.Span
             * @instance
             */
            Span.prototype.droppedLinksCount = 0;

            /**
             * Span status.
             * @member {outray.otlp.Status.$Properties|null|undefined} status
             * @memberof outray.otlp.Span
             * @instance
             */
            Span.prototype.status = null;

            /**
             * Span flags.
             * @member {number} flags
             * @memberof outray.otlp.Span
             * @instance
             */
            Span.prototype.flags = 0;

            /**
             * Creates a new Span instance using the specified properties.
             * @function create
             * @memberof outray.otlp.Span
             * @static
             * @param {outray.otlp.Span.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.Span} Span instance
             * @type {{
             *   (properties: outray.otlp.Span.$Shape): outray.otlp.Span & outray.otlp.Span.$Shape;
             *   (properties?: outray.otlp.Span.$Properties): outray.otlp.Span;
             * }}
             */
            Span.create = function(properties) {
                return new Span(properties);
            };

            /**
             * Encodes the specified Span message. Does not implicitly {@link outray.otlp.Span.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.Span
             * @static
             * @param {outray.otlp.Span.$Properties} message Span message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Span.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.traceId != null && $Object.hasOwnProperty.call(message, "traceId") && message.traceId.length)
                    writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.traceId);
                if (message.spanId != null && $Object.hasOwnProperty.call(message, "spanId") && message.spanId.length)
                    writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.spanId);
                if (message.traceState != null && $Object.hasOwnProperty.call(message, "traceState") && message.traceState !== "")
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.traceState);
                if (message.parentSpanId != null && $Object.hasOwnProperty.call(message, "parentSpanId") && message.parentSpanId.length)
                    writer.uint32(/* id 4, wireType 2 =*/34).bytes(message.parentSpanId);
                if (message.name != null && $Object.hasOwnProperty.call(message, "name") && message.name !== "")
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.name);
                if (message.kind != null && $Object.hasOwnProperty.call(message, "kind") && message.kind !== 0)
                    writer.uint32(/* id 6, wireType 0 =*/48).int32(message.kind);
                if (message.startTimeUnixNano != null && $Object.hasOwnProperty.call(message, "startTimeUnixNano") && (typeof message.startTimeUnixNano === "object" ? message.startTimeUnixNano.low || message.startTimeUnixNano.high : message.startTimeUnixNano !== 0))
                    writer.uint32(/* id 7, wireType 1 =*/57).fixed64(message.startTimeUnixNano);
                if (message.endTimeUnixNano != null && $Object.hasOwnProperty.call(message, "endTimeUnixNano") && (typeof message.endTimeUnixNano === "object" ? message.endTimeUnixNano.low || message.endTimeUnixNano.high : message.endTimeUnixNano !== 0))
                    writer.uint32(/* id 8, wireType 1 =*/65).fixed64(message.endTimeUnixNano);
                if (message.attributes != null && message.attributes.length)
                    for (let i = 0; i < message.attributes.length; ++i)
                        $root.outray.otlp.KeyValue.encode(message.attributes[i], writer.uint32(/* id 9, wireType 2 =*/74).fork(), _depth + 1).ldelim();
                if (message.droppedAttributesCount != null && $Object.hasOwnProperty.call(message, "droppedAttributesCount") && message.droppedAttributesCount !== 0)
                    writer.uint32(/* id 10, wireType 0 =*/80).uint32(message.droppedAttributesCount);
                if (message.events != null && message.events.length)
                    for (let i = 0; i < message.events.length; ++i)
                        $root.outray.otlp.Span.Event.encode(message.events[i], writer.uint32(/* id 11, wireType 2 =*/90).fork(), _depth + 1).ldelim();
                if (message.droppedEventsCount != null && $Object.hasOwnProperty.call(message, "droppedEventsCount") && message.droppedEventsCount !== 0)
                    writer.uint32(/* id 12, wireType 0 =*/96).uint32(message.droppedEventsCount);
                if (message.links != null && message.links.length)
                    for (let i = 0; i < message.links.length; ++i)
                        $root.outray.otlp.Span.Link.encode(message.links[i], writer.uint32(/* id 13, wireType 2 =*/106).fork(), _depth + 1).ldelim();
                if (message.droppedLinksCount != null && $Object.hasOwnProperty.call(message, "droppedLinksCount") && message.droppedLinksCount !== 0)
                    writer.uint32(/* id 14, wireType 0 =*/112).uint32(message.droppedLinksCount);
                if (message.status != null && $Object.hasOwnProperty.call(message, "status"))
                    $root.outray.otlp.Status.encode(message.status, writer.uint32(/* id 15, wireType 2 =*/122).fork(), _depth + 1).ldelim();
                if (message.flags != null && $Object.hasOwnProperty.call(message, "flags") && message.flags !== 0)
                    writer.uint32(/* id 16, wireType 5 =*/133).fixed32(message.flags);
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes a Span message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.Span
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.Span & outray.otlp.Span.$Shape} Span
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Span.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.Span();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.bytes()).length)
                                message.traceId = value;
                            else
                                delete message.traceId;
                            continue;
                        }
                    case 2: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.bytes()).length)
                                message.spanId = value;
                            else
                                delete message.spanId;
                            continue;
                        }
                    case 3: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.stringVerify()).length)
                                message.traceState = value;
                            else
                                delete message.traceState;
                            continue;
                        }
                    case 4: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.bytes()).length)
                                message.parentSpanId = value;
                            else
                                delete message.parentSpanId;
                            continue;
                        }
                    case 5: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.stringVerify()).length)
                                message.name = value;
                            else
                                delete message.name;
                            continue;
                        }
                    case 6: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.int32())
                                message.kind = value;
                            else
                                delete message.kind;
                            continue;
                        }
                    case 7: {
                            if (wireType !== 1)
                                break;
                            if (typeof (value = reader.fixed64()) === "object" ? value.low || value.high : value !== 0)
                                message.startTimeUnixNano = value;
                            else
                                delete message.startTimeUnixNano;
                            continue;
                        }
                    case 8: {
                            if (wireType !== 1)
                                break;
                            if (typeof (value = reader.fixed64()) === "object" ? value.low || value.high : value !== 0)
                                message.endTimeUnixNano = value;
                            else
                                delete message.endTimeUnixNano;
                            continue;
                        }
                    case 9: {
                            if (wireType !== 2)
                                break;
                            if (!(message.attributes && message.attributes.length))
                                message.attributes = [];
                            message.attributes.push($root.outray.otlp.KeyValue.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 10: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.uint32())
                                message.droppedAttributesCount = value;
                            else
                                delete message.droppedAttributesCount;
                            continue;
                        }
                    case 11: {
                            if (wireType !== 2)
                                break;
                            if (!(message.events && message.events.length))
                                message.events = [];
                            message.events.push($root.outray.otlp.Span.Event.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 12: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.uint32())
                                message.droppedEventsCount = value;
                            else
                                delete message.droppedEventsCount;
                            continue;
                        }
                    case 13: {
                            if (wireType !== 2)
                                break;
                            if (!(message.links && message.links.length))
                                message.links = [];
                            message.links.push($root.outray.otlp.Span.Link.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 14: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.uint32())
                                message.droppedLinksCount = value;
                            else
                                delete message.droppedLinksCount;
                            continue;
                        }
                    case 15: {
                            if (wireType !== 2)
                                break;
                            message.status = $root.outray.otlp.Status.decode(reader, reader.uint32(), $undefined, _depth + 1, message.status);
                            continue;
                        }
                    case 16: {
                            if (wireType !== 5)
                                break;
                            if (value = reader.fixed32())
                                message.flags = value;
                            else
                                delete message.flags;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates a Span message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.Span
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.Span} Span
             */
            Span.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.Span)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.Span: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.Span();
                if (object.traceId != null)
                    if (object.traceId.length)
                        if (typeof object.traceId === "string")
                            $util.base64.decode(object.traceId, message.traceId = $util.newBuffer($util.base64.length(object.traceId)), 0);
                        else if (object.traceId.length >= 0)
                            message.traceId = object.traceId;
                if (object.spanId != null)
                    if (object.spanId.length)
                        if (typeof object.spanId === "string")
                            $util.base64.decode(object.spanId, message.spanId = $util.newBuffer($util.base64.length(object.spanId)), 0);
                        else if (object.spanId.length >= 0)
                            message.spanId = object.spanId;
                if (object.traceState != null)
                    if (typeof object.traceState !== "string" || object.traceState.length)
                        message.traceState = $String(object.traceState);
                if (object.parentSpanId != null)
                    if (object.parentSpanId.length)
                        if (typeof object.parentSpanId === "string")
                            $util.base64.decode(object.parentSpanId, message.parentSpanId = $util.newBuffer($util.base64.length(object.parentSpanId)), 0);
                        else if (object.parentSpanId.length >= 0)
                            message.parentSpanId = object.parentSpanId;
                if (object.name != null)
                    if (typeof object.name !== "string" || object.name.length)
                        message.name = $String(object.name);
                if (object.kind !== 0 && (typeof object.kind !== "string" || $root.outray.otlp.Span.SpanKind[object.kind] !== 0))
                    switch (object.kind) {
                    case "SPAN_KIND_UNSPECIFIED":
                    case 0:
                        message.kind = 0;
                        break;
                    case "SPAN_KIND_INTERNAL":
                    case 1:
                        message.kind = 1;
                        break;
                    case "SPAN_KIND_SERVER":
                    case 2:
                        message.kind = 2;
                        break;
                    case "SPAN_KIND_CLIENT":
                    case 3:
                        message.kind = 3;
                        break;
                    case "SPAN_KIND_PRODUCER":
                    case 4:
                        message.kind = 4;
                        break;
                    case "SPAN_KIND_CONSUMER":
                    case 5:
                        message.kind = 5;
                        break;
                    default:
                        if (typeof object.kind === "number" && (object.kind | 0) === object.kind)
                            message.kind = object.kind;
                    }
                if (object.startTimeUnixNano != null)
                    if (typeof object.startTimeUnixNano === "object" ? object.startTimeUnixNano.low || object.startTimeUnixNano.high : $Number(object.startTimeUnixNano) !== 0)
                        if ($util.Long)
                            message.startTimeUnixNano = $util.Long.fromValue(object.startTimeUnixNano, true);
                        else if (typeof object.startTimeUnixNano === "string")
                            message.startTimeUnixNano = $parseInt(object.startTimeUnixNano, 10);
                        else if (typeof object.startTimeUnixNano === "number")
                            message.startTimeUnixNano = object.startTimeUnixNano;
                        else if (typeof object.startTimeUnixNano === "object")
                            message.startTimeUnixNano = new $util.LongBits(object.startTimeUnixNano.low >>> 0, object.startTimeUnixNano.high >>> 0).toNumber(true);
                if (object.endTimeUnixNano != null)
                    if (typeof object.endTimeUnixNano === "object" ? object.endTimeUnixNano.low || object.endTimeUnixNano.high : $Number(object.endTimeUnixNano) !== 0)
                        if ($util.Long)
                            message.endTimeUnixNano = $util.Long.fromValue(object.endTimeUnixNano, true);
                        else if (typeof object.endTimeUnixNano === "string")
                            message.endTimeUnixNano = $parseInt(object.endTimeUnixNano, 10);
                        else if (typeof object.endTimeUnixNano === "number")
                            message.endTimeUnixNano = object.endTimeUnixNano;
                        else if (typeof object.endTimeUnixNano === "object")
                            message.endTimeUnixNano = new $util.LongBits(object.endTimeUnixNano.low >>> 0, object.endTimeUnixNano.high >>> 0).toNumber(true);
                if (object.attributes) {
                    if (!$Array.isArray(object.attributes))
                        throw $TypeError(".outray.otlp.Span.attributes: array expected");
                    message.attributes = $Array(object.attributes.length);
                    for (let i = 0; i < object.attributes.length; ++i) {
                        if (!$util.isObject(object.attributes[i]))
                            throw $TypeError(".outray.otlp.Span.attributes: object expected");
                        message.attributes[i] = $root.outray.otlp.KeyValue.fromObject(object.attributes[i], _depth + 1);
                    }
                }
                if (object.droppedAttributesCount != null)
                    if ($Number(object.droppedAttributesCount) !== 0)
                        message.droppedAttributesCount = object.droppedAttributesCount >>> 0;
                if (object.events) {
                    if (!$Array.isArray(object.events))
                        throw $TypeError(".outray.otlp.Span.events: array expected");
                    message.events = $Array(object.events.length);
                    for (let i = 0; i < object.events.length; ++i) {
                        if (!$util.isObject(object.events[i]))
                            throw $TypeError(".outray.otlp.Span.events: object expected");
                        message.events[i] = $root.outray.otlp.Span.Event.fromObject(object.events[i], _depth + 1);
                    }
                }
                if (object.droppedEventsCount != null)
                    if ($Number(object.droppedEventsCount) !== 0)
                        message.droppedEventsCount = object.droppedEventsCount >>> 0;
                if (object.links) {
                    if (!$Array.isArray(object.links))
                        throw $TypeError(".outray.otlp.Span.links: array expected");
                    message.links = $Array(object.links.length);
                    for (let i = 0; i < object.links.length; ++i) {
                        if (!$util.isObject(object.links[i]))
                            throw $TypeError(".outray.otlp.Span.links: object expected");
                        message.links[i] = $root.outray.otlp.Span.Link.fromObject(object.links[i], _depth + 1);
                    }
                }
                if (object.droppedLinksCount != null)
                    if ($Number(object.droppedLinksCount) !== 0)
                        message.droppedLinksCount = object.droppedLinksCount >>> 0;
                if (object.status != null) {
                    if (!$util.isObject(object.status))
                        throw $TypeError(".outray.otlp.Span.status: object expected");
                    message.status = $root.outray.otlp.Status.fromObject(object.status, _depth + 1);
                }
                if (object.flags != null)
                    if ($Number(object.flags) !== 0)
                        message.flags = object.flags >>> 0;
                return message;
            };

            /**
             * Creates a plain object from a Span message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.Span
             * @static
             * @param {outray.otlp.Span} message Span
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            Span.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults) {
                    object.attributes = [];
                    object.events = [];
                    object.links = [];
                }
                if (options.defaults) {
                    if (options.bytes === $String)
                        object.traceId = "";
                    else {
                        object.traceId = [];
                        if (options.bytes !== $Array)
                            object.traceId = $util.newBuffer(object.traceId);
                    }
                    if (options.bytes === $String)
                        object.spanId = "";
                    else {
                        object.spanId = [];
                        if (options.bytes !== $Array)
                            object.spanId = $util.newBuffer(object.spanId);
                    }
                    object.traceState = "";
                    if (options.bytes === $String)
                        object.parentSpanId = "";
                    else {
                        object.parentSpanId = [];
                        if (options.bytes !== $Array)
                            object.parentSpanId = $util.newBuffer(object.parentSpanId);
                    }
                    object.name = "";
                    object.kind = options.enums === $String ? "SPAN_KIND_UNSPECIFIED" : 0;
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, true);
                        object.startTimeUnixNano = options.longs === $String ? long.toString() : options.longs === $Number ? long.toNumber() : typeof $BigInt !== "undefined" && options.longs === $BigInt ? long.toBigInt() : long;
                    } else
                        object.startTimeUnixNano = options.longs === $String ? "0" : typeof $BigInt !== "undefined" && options.longs === $BigInt ? $BigInt("0") : 0;
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, true);
                        object.endTimeUnixNano = options.longs === $String ? long.toString() : options.longs === $Number ? long.toNumber() : typeof $BigInt !== "undefined" && options.longs === $BigInt ? long.toBigInt() : long;
                    } else
                        object.endTimeUnixNano = options.longs === $String ? "0" : typeof $BigInt !== "undefined" && options.longs === $BigInt ? $BigInt("0") : 0;
                    object.droppedAttributesCount = 0;
                    object.droppedEventsCount = 0;
                    object.droppedLinksCount = 0;
                    object.status = null;
                    object.flags = 0;
                }
                if (message.traceId != null && $Object.hasOwnProperty.call(message, "traceId"))
                    object.traceId = options.bytes === $String ? $util.base64.encode(message.traceId, 0, message.traceId.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.traceId) : message.traceId;
                if (message.spanId != null && $Object.hasOwnProperty.call(message, "spanId"))
                    object.spanId = options.bytes === $String ? $util.base64.encode(message.spanId, 0, message.spanId.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.spanId) : message.spanId;
                if (message.traceState != null && $Object.hasOwnProperty.call(message, "traceState"))
                    object.traceState = message.traceState;
                if (message.parentSpanId != null && $Object.hasOwnProperty.call(message, "parentSpanId"))
                    object.parentSpanId = options.bytes === $String ? $util.base64.encode(message.parentSpanId, 0, message.parentSpanId.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.parentSpanId) : message.parentSpanId;
                if (message.name != null && $Object.hasOwnProperty.call(message, "name"))
                    object.name = message.name;
                if (message.kind != null && $Object.hasOwnProperty.call(message, "kind"))
                    object.kind = options.enums === $String ? $root.outray.otlp.Span.SpanKind[message.kind] === $undefined ? message.kind : $root.outray.otlp.Span.SpanKind[message.kind] : message.kind;
                if (message.startTimeUnixNano != null && $Object.hasOwnProperty.call(message, "startTimeUnixNano"))
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.startTimeUnixNano = typeof message.startTimeUnixNano === "number" ? $BigInt(message.startTimeUnixNano) : $util.Long.fromBits(message.startTimeUnixNano.low >>> 0, message.startTimeUnixNano.high >>> 0, true).toBigInt();
                    else if (typeof message.startTimeUnixNano === "number")
                        object.startTimeUnixNano = options.longs === $String ? $String(message.startTimeUnixNano) : message.startTimeUnixNano;
                    else
                        object.startTimeUnixNano = options.longs === $String ? $util.Long.prototype.toString.call(message.startTimeUnixNano) : options.longs === $Number ? new $util.LongBits(message.startTimeUnixNano.low >>> 0, message.startTimeUnixNano.high >>> 0).toNumber(true) : message.startTimeUnixNano;
                if (message.endTimeUnixNano != null && $Object.hasOwnProperty.call(message, "endTimeUnixNano"))
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.endTimeUnixNano = typeof message.endTimeUnixNano === "number" ? $BigInt(message.endTimeUnixNano) : $util.Long.fromBits(message.endTimeUnixNano.low >>> 0, message.endTimeUnixNano.high >>> 0, true).toBigInt();
                    else if (typeof message.endTimeUnixNano === "number")
                        object.endTimeUnixNano = options.longs === $String ? $String(message.endTimeUnixNano) : message.endTimeUnixNano;
                    else
                        object.endTimeUnixNano = options.longs === $String ? $util.Long.prototype.toString.call(message.endTimeUnixNano) : options.longs === $Number ? new $util.LongBits(message.endTimeUnixNano.low >>> 0, message.endTimeUnixNano.high >>> 0).toNumber(true) : message.endTimeUnixNano;
                if (message.attributes && message.attributes.length) {
                    object.attributes = $Array(message.attributes.length);
                    for (let j = 0; j < message.attributes.length; ++j)
                        object.attributes[j] = $root.outray.otlp.KeyValue.toObject(message.attributes[j], options, _depth + 1);
                }
                if (message.droppedAttributesCount != null && $Object.hasOwnProperty.call(message, "droppedAttributesCount"))
                    object.droppedAttributesCount = message.droppedAttributesCount;
                if (message.events && message.events.length) {
                    object.events = $Array(message.events.length);
                    for (let j = 0; j < message.events.length; ++j)
                        object.events[j] = $root.outray.otlp.Span.Event.toObject(message.events[j], options, _depth + 1);
                }
                if (message.droppedEventsCount != null && $Object.hasOwnProperty.call(message, "droppedEventsCount"))
                    object.droppedEventsCount = message.droppedEventsCount;
                if (message.links && message.links.length) {
                    object.links = $Array(message.links.length);
                    for (let j = 0; j < message.links.length; ++j)
                        object.links[j] = $root.outray.otlp.Span.Link.toObject(message.links[j], options, _depth + 1);
                }
                if (message.droppedLinksCount != null && $Object.hasOwnProperty.call(message, "droppedLinksCount"))
                    object.droppedLinksCount = message.droppedLinksCount;
                if (message.status != null && $Object.hasOwnProperty.call(message, "status"))
                    object.status = $root.outray.otlp.Status.toObject(message.status, options, _depth + 1);
                if (message.flags != null && $Object.hasOwnProperty.call(message, "flags"))
                    object.flags = message.flags;
                return object;
            };

            /**
             * Converts this Span to JSON.
             * @function toJSON
             * @memberof outray.otlp.Span
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            Span.prototype.toJSON = function() {
                return Span.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * SpanKind enum.
             * @name outray.otlp.Span.SpanKind
             * @enum {number}
             * @property {number} SPAN_KIND_UNSPECIFIED=0 SPAN_KIND_UNSPECIFIED value
             * @property {number} SPAN_KIND_INTERNAL=1 SPAN_KIND_INTERNAL value
             * @property {number} SPAN_KIND_SERVER=2 SPAN_KIND_SERVER value
             * @property {number} SPAN_KIND_CLIENT=3 SPAN_KIND_CLIENT value
             * @property {number} SPAN_KIND_PRODUCER=4 SPAN_KIND_PRODUCER value
             * @property {number} SPAN_KIND_CONSUMER=5 SPAN_KIND_CONSUMER value
             */
            Span.SpanKind = (function() {
                const valuesById = $Object.create(null), values = $Object.create(valuesById);
                values[valuesById[0] = "SPAN_KIND_UNSPECIFIED"] = 0;
                values[valuesById[1] = "SPAN_KIND_INTERNAL"] = 1;
                values[valuesById[2] = "SPAN_KIND_SERVER"] = 2;
                values[valuesById[3] = "SPAN_KIND_CLIENT"] = 3;
                values[valuesById[4] = "SPAN_KIND_PRODUCER"] = 4;
                values[valuesById[5] = "SPAN_KIND_CONSUMER"] = 5;
                return values;
            })();

            Span.Event = (function() {

                /**
                 * Properties of an Event.
                 * @typedef {Object} outray.otlp.Span.Event.$Properties
                 * @property {number|Long|null} [timeUnixNano] Event timeUnixNano
                 * @property {string|null} [name] Event name
                 * @property {Array.<outray.otlp.KeyValue.$Properties>|null} [attributes] Event attributes
                 * @property {number|null} [droppedAttributesCount] Event droppedAttributesCount
                 * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
                 */

                /**
                 * Properties of an Event.
                 * @memberof outray.otlp.Span
                 * @interface IEvent
                 * @augments outray.otlp.Span.Event.$Properties
                 * @deprecated Use outray.otlp.Span.Event.$Properties instead.
                 */

                /**
                 * Shape of an Event.
                 * @typedef {{
                 *   timeUnixNano?: number|Long|null;
                 *   name?: string|null;
                 *   attributes?: Array.<outray.otlp.KeyValue.$Shape>|null;
                 *   droppedAttributesCount?: number|null;
                 *   $unknowns?: Array.<Uint8Array>;
                 * }} outray.otlp.Span.Event.$Shape
                 */

                /**
                 * Constructs a new Event.
                 * @memberof outray.otlp.Span
                 * @classdesc Represents an Event.
                 * @constructor
                 * @param {outray.otlp.Span.Event.$Properties=} [properties] Properties to set
                 * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
                 */
                const Event = function (properties) {
                    this.attributes = [];
                    if (properties)
                        for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                /**
                 * Event timeUnixNano.
                 * @member {number|Long} timeUnixNano
                 * @memberof outray.otlp.Span.Event
                 * @instance
                 */
                Event.prototype.timeUnixNano = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

                /**
                 * Event name.
                 * @member {string} name
                 * @memberof outray.otlp.Span.Event
                 * @instance
                 */
                Event.prototype.name = "";

                /**
                 * Event attributes.
                 * @member {Array.<outray.otlp.KeyValue.$Properties>} attributes
                 * @memberof outray.otlp.Span.Event
                 * @instance
                 */
                Event.prototype.attributes = $util.emptyArray;

                /**
                 * Event droppedAttributesCount.
                 * @member {number} droppedAttributesCount
                 * @memberof outray.otlp.Span.Event
                 * @instance
                 */
                Event.prototype.droppedAttributesCount = 0;

                /**
                 * Creates a new Event instance using the specified properties.
                 * @function create
                 * @memberof outray.otlp.Span.Event
                 * @static
                 * @param {outray.otlp.Span.Event.$Properties=} [properties] Properties to set
                 * @returns {outray.otlp.Span.Event} Event instance
                 * @type {{
                 *   (properties: outray.otlp.Span.Event.$Shape): outray.otlp.Span.Event & outray.otlp.Span.Event.$Shape;
                 *   (properties?: outray.otlp.Span.Event.$Properties): outray.otlp.Span.Event;
                 * }}
                 */
                Event.create = function(properties) {
                    return new Event(properties);
                };

                /**
                 * Encodes the specified Event message. Does not implicitly {@link outray.otlp.Span.Event.verify|verify} messages.
                 * @function encode
                 * @memberof outray.otlp.Span.Event
                 * @static
                 * @param {outray.otlp.Span.Event.$Properties} message Event message or plain object to encode
                 * @param {$protobuf.Writer} [writer] Writer to encode to
                 * @returns {$protobuf.Writer} Writer
                 */
                Event.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.timeUnixNano != null && $Object.hasOwnProperty.call(message, "timeUnixNano") && (typeof message.timeUnixNano === "object" ? message.timeUnixNano.low || message.timeUnixNano.high : message.timeUnixNano !== 0))
                        writer.uint32(/* id 1, wireType 1 =*/9).fixed64(message.timeUnixNano);
                    if (message.name != null && $Object.hasOwnProperty.call(message, "name") && message.name !== "")
                        writer.uint32(/* id 2, wireType 2 =*/18).string(message.name);
                    if (message.attributes != null && message.attributes.length)
                        for (let i = 0; i < message.attributes.length; ++i)
                            $root.outray.otlp.KeyValue.encode(message.attributes[i], writer.uint32(/* id 3, wireType 2 =*/26).fork(), _depth + 1).ldelim();
                    if (message.droppedAttributesCount != null && $Object.hasOwnProperty.call(message, "droppedAttributesCount") && message.droppedAttributesCount !== 0)
                        writer.uint32(/* id 4, wireType 0 =*/32).uint32(message.droppedAttributesCount);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (let i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                /**
                 * Decodes an Event message from the specified reader or buffer.
                 * @function decode
                 * @memberof outray.otlp.Span.Event
                 * @static
                 * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                 * @param {number} [length] Message length if known beforehand
                 * @returns {outray.otlp.Span.Event & outray.otlp.Span.Event.$Shape} Event
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                Event.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    let end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.outray.otlp.Span.Event();
                    while (reader.pos < end) {
                        let start = reader.pos;
                        let tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        let wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 1)
                                    break;
                                if (typeof (value = reader.fixed64()) === "object" ? value.low || value.high : value !== 0)
                                    message.timeUnixNano = value;
                                else
                                    delete message.timeUnixNano;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.name = value;
                                else
                                    delete message.name;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.attributes && message.attributes.length))
                                    message.attributes = [];
                                message.attributes.push($root.outray.otlp.KeyValue.decode(reader, reader.uint32(), $undefined, _depth + 1));
                                continue;
                            }
                        case 4: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.uint32())
                                    message.droppedAttributesCount = value;
                                else
                                    delete message.droppedAttributesCount;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                /**
                 * Creates an Event message from a plain object. Also converts values to their respective internal types.
                 * @function fromObject
                 * @memberof outray.otlp.Span.Event
                 * @static
                 * @param {Object.<string,*>} object Plain object
                 * @returns {outray.otlp.Span.Event} Event
                 */
                Event.fromObject = function (object, _depth) {
                    if (object instanceof $root.outray.otlp.Span.Event)
                        return object;
                    if (!$util.isObject(object))
                        throw $TypeError(".outray.otlp.Span.Event: object expected");
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    let message = new $root.outray.otlp.Span.Event();
                    if (object.timeUnixNano != null)
                        if (typeof object.timeUnixNano === "object" ? object.timeUnixNano.low || object.timeUnixNano.high : $Number(object.timeUnixNano) !== 0)
                            if ($util.Long)
                                message.timeUnixNano = $util.Long.fromValue(object.timeUnixNano, true);
                            else if (typeof object.timeUnixNano === "string")
                                message.timeUnixNano = $parseInt(object.timeUnixNano, 10);
                            else if (typeof object.timeUnixNano === "number")
                                message.timeUnixNano = object.timeUnixNano;
                            else if (typeof object.timeUnixNano === "object")
                                message.timeUnixNano = new $util.LongBits(object.timeUnixNano.low >>> 0, object.timeUnixNano.high >>> 0).toNumber(true);
                    if (object.name != null)
                        if (typeof object.name !== "string" || object.name.length)
                            message.name = $String(object.name);
                    if (object.attributes) {
                        if (!$Array.isArray(object.attributes))
                            throw $TypeError(".outray.otlp.Span.Event.attributes: array expected");
                        message.attributes = $Array(object.attributes.length);
                        for (let i = 0; i < object.attributes.length; ++i) {
                            if (!$util.isObject(object.attributes[i]))
                                throw $TypeError(".outray.otlp.Span.Event.attributes: object expected");
                            message.attributes[i] = $root.outray.otlp.KeyValue.fromObject(object.attributes[i], _depth + 1);
                        }
                    }
                    if (object.droppedAttributesCount != null)
                        if ($Number(object.droppedAttributesCount) !== 0)
                            message.droppedAttributesCount = object.droppedAttributesCount >>> 0;
                    return message;
                };

                /**
                 * Creates a plain object from an Event message. Also converts values to other types if specified.
                 * @function toObject
                 * @memberof outray.otlp.Span.Event
                 * @static
                 * @param {outray.otlp.Span.Event} message Event
                 * @param {$protobuf.IConversionOptions} [options] Conversion options
                 * @returns {Object.<string,*>} Plain object
                 */
                Event.toObject = function (message, options, _depth) {
                    if (!options)
                        options = {};
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    let object = {};
                    if (options.arrays || options.defaults)
                        object.attributes = [];
                    if (options.defaults) {
                        if ($util.Long) {
                            let long = new $util.Long(0, 0, true);
                            object.timeUnixNano = options.longs === $String ? long.toString() : options.longs === $Number ? long.toNumber() : typeof $BigInt !== "undefined" && options.longs === $BigInt ? long.toBigInt() : long;
                        } else
                            object.timeUnixNano = options.longs === $String ? "0" : typeof $BigInt !== "undefined" && options.longs === $BigInt ? $BigInt("0") : 0;
                        object.name = "";
                        object.droppedAttributesCount = 0;
                    }
                    if (message.timeUnixNano != null && $Object.hasOwnProperty.call(message, "timeUnixNano"))
                        if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                            object.timeUnixNano = typeof message.timeUnixNano === "number" ? $BigInt(message.timeUnixNano) : $util.Long.fromBits(message.timeUnixNano.low >>> 0, message.timeUnixNano.high >>> 0, true).toBigInt();
                        else if (typeof message.timeUnixNano === "number")
                            object.timeUnixNano = options.longs === $String ? $String(message.timeUnixNano) : message.timeUnixNano;
                        else
                            object.timeUnixNano = options.longs === $String ? $util.Long.prototype.toString.call(message.timeUnixNano) : options.longs === $Number ? new $util.LongBits(message.timeUnixNano.low >>> 0, message.timeUnixNano.high >>> 0).toNumber(true) : message.timeUnixNano;
                    if (message.name != null && $Object.hasOwnProperty.call(message, "name"))
                        object.name = message.name;
                    if (message.attributes && message.attributes.length) {
                        object.attributes = $Array(message.attributes.length);
                        for (let j = 0; j < message.attributes.length; ++j)
                            object.attributes[j] = $root.outray.otlp.KeyValue.toObject(message.attributes[j], options, _depth + 1);
                    }
                    if (message.droppedAttributesCount != null && $Object.hasOwnProperty.call(message, "droppedAttributesCount"))
                        object.droppedAttributesCount = message.droppedAttributesCount;
                    return object;
                };

                /**
                 * Converts this Event to JSON.
                 * @function toJSON
                 * @memberof outray.otlp.Span.Event
                 * @instance
                 * @returns {Object.<string,*>} JSON object
                 */
                Event.prototype.toJSON = function() {
                    return Event.toObject(this, $protobuf.util.toJSONOptions);
                };

                return Event;
            })();

            Span.Link = (function() {

                /**
                 * Properties of a Link.
                 * @typedef {Object} outray.otlp.Span.Link.$Properties
                 * @property {Uint8Array|null} [traceId] Link traceId
                 * @property {Uint8Array|null} [spanId] Link spanId
                 * @property {string|null} [traceState] Link traceState
                 * @property {Array.<outray.otlp.KeyValue.$Properties>|null} [attributes] Link attributes
                 * @property {number|null} [droppedAttributesCount] Link droppedAttributesCount
                 * @property {number|null} [flags] Link flags
                 * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
                 */

                /**
                 * Properties of a Link.
                 * @memberof outray.otlp.Span
                 * @interface ILink
                 * @augments outray.otlp.Span.Link.$Properties
                 * @deprecated Use outray.otlp.Span.Link.$Properties instead.
                 */

                /**
                 * Shape of a Link.
                 * @typedef {{
                 *   traceId?: Uint8Array|null;
                 *   spanId?: Uint8Array|null;
                 *   traceState?: string|null;
                 *   attributes?: Array.<outray.otlp.KeyValue.$Shape>|null;
                 *   droppedAttributesCount?: number|null;
                 *   flags?: number|null;
                 *   $unknowns?: Array.<Uint8Array>;
                 * }} outray.otlp.Span.Link.$Shape
                 */

                /**
                 * Constructs a new Link.
                 * @memberof outray.otlp.Span
                 * @classdesc Represents a Link.
                 * @constructor
                 * @param {outray.otlp.Span.Link.$Properties=} [properties] Properties to set
                 * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
                 */
                const Link = function (properties) {
                    this.attributes = [];
                    if (properties)
                        for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                /**
                 * Link traceId.
                 * @member {Uint8Array} traceId
                 * @memberof outray.otlp.Span.Link
                 * @instance
                 */
                Link.prototype.traceId = $util.newBuffer([]);

                /**
                 * Link spanId.
                 * @member {Uint8Array} spanId
                 * @memberof outray.otlp.Span.Link
                 * @instance
                 */
                Link.prototype.spanId = $util.newBuffer([]);

                /**
                 * Link traceState.
                 * @member {string} traceState
                 * @memberof outray.otlp.Span.Link
                 * @instance
                 */
                Link.prototype.traceState = "";

                /**
                 * Link attributes.
                 * @member {Array.<outray.otlp.KeyValue.$Properties>} attributes
                 * @memberof outray.otlp.Span.Link
                 * @instance
                 */
                Link.prototype.attributes = $util.emptyArray;

                /**
                 * Link droppedAttributesCount.
                 * @member {number} droppedAttributesCount
                 * @memberof outray.otlp.Span.Link
                 * @instance
                 */
                Link.prototype.droppedAttributesCount = 0;

                /**
                 * Link flags.
                 * @member {number} flags
                 * @memberof outray.otlp.Span.Link
                 * @instance
                 */
                Link.prototype.flags = 0;

                /**
                 * Creates a new Link instance using the specified properties.
                 * @function create
                 * @memberof outray.otlp.Span.Link
                 * @static
                 * @param {outray.otlp.Span.Link.$Properties=} [properties] Properties to set
                 * @returns {outray.otlp.Span.Link} Link instance
                 * @type {{
                 *   (properties: outray.otlp.Span.Link.$Shape): outray.otlp.Span.Link & outray.otlp.Span.Link.$Shape;
                 *   (properties?: outray.otlp.Span.Link.$Properties): outray.otlp.Span.Link;
                 * }}
                 */
                Link.create = function(properties) {
                    return new Link(properties);
                };

                /**
                 * Encodes the specified Link message. Does not implicitly {@link outray.otlp.Span.Link.verify|verify} messages.
                 * @function encode
                 * @memberof outray.otlp.Span.Link
                 * @static
                 * @param {outray.otlp.Span.Link.$Properties} message Link message or plain object to encode
                 * @param {$protobuf.Writer} [writer] Writer to encode to
                 * @returns {$protobuf.Writer} Writer
                 */
                Link.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.traceId != null && $Object.hasOwnProperty.call(message, "traceId") && message.traceId.length)
                        writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.traceId);
                    if (message.spanId != null && $Object.hasOwnProperty.call(message, "spanId") && message.spanId.length)
                        writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.spanId);
                    if (message.traceState != null && $Object.hasOwnProperty.call(message, "traceState") && message.traceState !== "")
                        writer.uint32(/* id 3, wireType 2 =*/26).string(message.traceState);
                    if (message.attributes != null && message.attributes.length)
                        for (let i = 0; i < message.attributes.length; ++i)
                            $root.outray.otlp.KeyValue.encode(message.attributes[i], writer.uint32(/* id 4, wireType 2 =*/34).fork(), _depth + 1).ldelim();
                    if (message.droppedAttributesCount != null && $Object.hasOwnProperty.call(message, "droppedAttributesCount") && message.droppedAttributesCount !== 0)
                        writer.uint32(/* id 5, wireType 0 =*/40).uint32(message.droppedAttributesCount);
                    if (message.flags != null && $Object.hasOwnProperty.call(message, "flags") && message.flags !== 0)
                        writer.uint32(/* id 6, wireType 5 =*/53).fixed32(message.flags);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (let i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                /**
                 * Decodes a Link message from the specified reader or buffer.
                 * @function decode
                 * @memberof outray.otlp.Span.Link
                 * @static
                 * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                 * @param {number} [length] Message length if known beforehand
                 * @returns {outray.otlp.Span.Link & outray.otlp.Span.Link.$Shape} Link
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                Link.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    let end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.outray.otlp.Span.Link();
                    while (reader.pos < end) {
                        let start = reader.pos;
                        let tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        let wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.bytes()).length)
                                    message.traceId = value;
                                else
                                    delete message.traceId;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.bytes()).length)
                                    message.spanId = value;
                                else
                                    delete message.spanId;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.traceState = value;
                                else
                                    delete message.traceState;
                                continue;
                            }
                        case 4: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.attributes && message.attributes.length))
                                    message.attributes = [];
                                message.attributes.push($root.outray.otlp.KeyValue.decode(reader, reader.uint32(), $undefined, _depth + 1));
                                continue;
                            }
                        case 5: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.uint32())
                                    message.droppedAttributesCount = value;
                                else
                                    delete message.droppedAttributesCount;
                                continue;
                            }
                        case 6: {
                                if (wireType !== 5)
                                    break;
                                if (value = reader.fixed32())
                                    message.flags = value;
                                else
                                    delete message.flags;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                /**
                 * Creates a Link message from a plain object. Also converts values to their respective internal types.
                 * @function fromObject
                 * @memberof outray.otlp.Span.Link
                 * @static
                 * @param {Object.<string,*>} object Plain object
                 * @returns {outray.otlp.Span.Link} Link
                 */
                Link.fromObject = function (object, _depth) {
                    if (object instanceof $root.outray.otlp.Span.Link)
                        return object;
                    if (!$util.isObject(object))
                        throw $TypeError(".outray.otlp.Span.Link: object expected");
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    let message = new $root.outray.otlp.Span.Link();
                    if (object.traceId != null)
                        if (object.traceId.length)
                            if (typeof object.traceId === "string")
                                $util.base64.decode(object.traceId, message.traceId = $util.newBuffer($util.base64.length(object.traceId)), 0);
                            else if (object.traceId.length >= 0)
                                message.traceId = object.traceId;
                    if (object.spanId != null)
                        if (object.spanId.length)
                            if (typeof object.spanId === "string")
                                $util.base64.decode(object.spanId, message.spanId = $util.newBuffer($util.base64.length(object.spanId)), 0);
                            else if (object.spanId.length >= 0)
                                message.spanId = object.spanId;
                    if (object.traceState != null)
                        if (typeof object.traceState !== "string" || object.traceState.length)
                            message.traceState = $String(object.traceState);
                    if (object.attributes) {
                        if (!$Array.isArray(object.attributes))
                            throw $TypeError(".outray.otlp.Span.Link.attributes: array expected");
                        message.attributes = $Array(object.attributes.length);
                        for (let i = 0; i < object.attributes.length; ++i) {
                            if (!$util.isObject(object.attributes[i]))
                                throw $TypeError(".outray.otlp.Span.Link.attributes: object expected");
                            message.attributes[i] = $root.outray.otlp.KeyValue.fromObject(object.attributes[i], _depth + 1);
                        }
                    }
                    if (object.droppedAttributesCount != null)
                        if ($Number(object.droppedAttributesCount) !== 0)
                            message.droppedAttributesCount = object.droppedAttributesCount >>> 0;
                    if (object.flags != null)
                        if ($Number(object.flags) !== 0)
                            message.flags = object.flags >>> 0;
                    return message;
                };

                /**
                 * Creates a plain object from a Link message. Also converts values to other types if specified.
                 * @function toObject
                 * @memberof outray.otlp.Span.Link
                 * @static
                 * @param {outray.otlp.Span.Link} message Link
                 * @param {$protobuf.IConversionOptions} [options] Conversion options
                 * @returns {Object.<string,*>} Plain object
                 */
                Link.toObject = function (message, options, _depth) {
                    if (!options)
                        options = {};
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    let object = {};
                    if (options.arrays || options.defaults)
                        object.attributes = [];
                    if (options.defaults) {
                        if (options.bytes === $String)
                            object.traceId = "";
                        else {
                            object.traceId = [];
                            if (options.bytes !== $Array)
                                object.traceId = $util.newBuffer(object.traceId);
                        }
                        if (options.bytes === $String)
                            object.spanId = "";
                        else {
                            object.spanId = [];
                            if (options.bytes !== $Array)
                                object.spanId = $util.newBuffer(object.spanId);
                        }
                        object.traceState = "";
                        object.droppedAttributesCount = 0;
                        object.flags = 0;
                    }
                    if (message.traceId != null && $Object.hasOwnProperty.call(message, "traceId"))
                        object.traceId = options.bytes === $String ? $util.base64.encode(message.traceId, 0, message.traceId.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.traceId) : message.traceId;
                    if (message.spanId != null && $Object.hasOwnProperty.call(message, "spanId"))
                        object.spanId = options.bytes === $String ? $util.base64.encode(message.spanId, 0, message.spanId.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.spanId) : message.spanId;
                    if (message.traceState != null && $Object.hasOwnProperty.call(message, "traceState"))
                        object.traceState = message.traceState;
                    if (message.attributes && message.attributes.length) {
                        object.attributes = $Array(message.attributes.length);
                        for (let j = 0; j < message.attributes.length; ++j)
                            object.attributes[j] = $root.outray.otlp.KeyValue.toObject(message.attributes[j], options, _depth + 1);
                    }
                    if (message.droppedAttributesCount != null && $Object.hasOwnProperty.call(message, "droppedAttributesCount"))
                        object.droppedAttributesCount = message.droppedAttributesCount;
                    if (message.flags != null && $Object.hasOwnProperty.call(message, "flags"))
                        object.flags = message.flags;
                    return object;
                };

                /**
                 * Converts this Link to JSON.
                 * @function toJSON
                 * @memberof outray.otlp.Span.Link
                 * @instance
                 * @returns {Object.<string,*>} JSON object
                 */
                Link.prototype.toJSON = function() {
                    return Link.toObject(this, $protobuf.util.toJSONOptions);
                };

                return Link;
            })();

            return Span;
        })();

        otlp.Status = (function() {

            /**
             * Properties of a Status.
             * @typedef {Object} outray.otlp.Status.$Properties
             * @property {string|null} [message] Status message
             * @property {outray.otlp.Status.StatusCode|null} [code] Status code
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of a Status.
             * @memberof outray.otlp
             * @interface IStatus
             * @augments outray.otlp.Status.$Properties
             * @deprecated Use outray.otlp.Status.$Properties instead.
             */

            /**
             * Shape of a Status.
             * @typedef {outray.otlp.Status.$Properties} outray.otlp.Status.$Shape
             */

            /**
             * Constructs a new Status.
             * @memberof outray.otlp
             * @classdesc Represents a Status.
             * @constructor
             * @param {outray.otlp.Status.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const Status = function (properties) {
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * Status message.
             * @member {string} message
             * @memberof outray.otlp.Status
             * @instance
             */
            Status.prototype.message = "";

            /**
             * Status code.
             * @member {outray.otlp.Status.StatusCode} code
             * @memberof outray.otlp.Status
             * @instance
             */
            Status.prototype.code = 0;

            /**
             * Creates a new Status instance using the specified properties.
             * @function create
             * @memberof outray.otlp.Status
             * @static
             * @param {outray.otlp.Status.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.Status} Status instance
             * @type {{
             *   (properties: outray.otlp.Status.$Shape): outray.otlp.Status & outray.otlp.Status.$Shape;
             *   (properties?: outray.otlp.Status.$Properties): outray.otlp.Status;
             * }}
             */
            Status.create = function(properties) {
                return new Status(properties);
            };

            /**
             * Encodes the specified Status message. Does not implicitly {@link outray.otlp.Status.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.Status
             * @static
             * @param {outray.otlp.Status.$Properties} message Status message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Status.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.message != null && $Object.hasOwnProperty.call(message, "message") && message.message !== "")
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.message);
                if (message.code != null && $Object.hasOwnProperty.call(message, "code") && message.code !== 0)
                    writer.uint32(/* id 3, wireType 0 =*/24).int32(message.code);
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes a Status message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.Status
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.Status & outray.otlp.Status.$Shape} Status
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Status.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.Status();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 2: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.stringVerify()).length)
                                message.message = value;
                            else
                                delete message.message;
                            continue;
                        }
                    case 3: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.int32())
                                message.code = value;
                            else
                                delete message.code;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates a Status message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.Status
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.Status} Status
             */
            Status.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.Status)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.Status: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.Status();
                if (object.message != null)
                    if (typeof object.message !== "string" || object.message.length)
                        message.message = $String(object.message);
                if (object.code !== 0 && (typeof object.code !== "string" || $root.outray.otlp.Status.StatusCode[object.code] !== 0))
                    switch (object.code) {
                    case "STATUS_CODE_UNSET":
                    case 0:
                        message.code = 0;
                        break;
                    case "STATUS_CODE_OK":
                    case 1:
                        message.code = 1;
                        break;
                    case "STATUS_CODE_ERROR":
                    case 2:
                        message.code = 2;
                        break;
                    default:
                        if (typeof object.code === "number" && (object.code | 0) === object.code)
                            message.code = object.code;
                    }
                return message;
            };

            /**
             * Creates a plain object from a Status message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.Status
             * @static
             * @param {outray.otlp.Status} message Status
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            Status.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    object.message = "";
                    object.code = options.enums === $String ? "STATUS_CODE_UNSET" : 0;
                }
                if (message.message != null && $Object.hasOwnProperty.call(message, "message"))
                    object.message = message.message;
                if (message.code != null && $Object.hasOwnProperty.call(message, "code"))
                    object.code = options.enums === $String ? $root.outray.otlp.Status.StatusCode[message.code] === $undefined ? message.code : $root.outray.otlp.Status.StatusCode[message.code] : message.code;
                return object;
            };

            /**
             * Converts this Status to JSON.
             * @function toJSON
             * @memberof outray.otlp.Status
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            Status.prototype.toJSON = function() {
                return Status.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * StatusCode enum.
             * @name outray.otlp.Status.StatusCode
             * @enum {number}
             * @property {number} STATUS_CODE_UNSET=0 STATUS_CODE_UNSET value
             * @property {number} STATUS_CODE_OK=1 STATUS_CODE_OK value
             * @property {number} STATUS_CODE_ERROR=2 STATUS_CODE_ERROR value
             */
            Status.StatusCode = (function() {
                const valuesById = $Object.create(null), values = $Object.create(valuesById);
                values[valuesById[0] = "STATUS_CODE_UNSET"] = 0;
                values[valuesById[1] = "STATUS_CODE_OK"] = 1;
                values[valuesById[2] = "STATUS_CODE_ERROR"] = 2;
                return values;
            })();

            return Status;
        })();

        otlp.ExportTraceServiceRequest = (function() {

            /**
             * Properties of an ExportTraceServiceRequest.
             * @typedef {Object} outray.otlp.ExportTraceServiceRequest.$Properties
             * @property {Array.<outray.otlp.ResourceSpans.$Properties>|null} [resourceSpans] ExportTraceServiceRequest resourceSpans
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of an ExportTraceServiceRequest.
             * @memberof outray.otlp
             * @interface IExportTraceServiceRequest
             * @augments outray.otlp.ExportTraceServiceRequest.$Properties
             * @deprecated Use outray.otlp.ExportTraceServiceRequest.$Properties instead.
             */

            /**
             * Shape of an ExportTraceServiceRequest.
             * @typedef {{
             *   resourceSpans?: Array.<outray.otlp.ResourceSpans.$Shape>|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.ExportTraceServiceRequest.$Shape
             */

            /**
             * Constructs a new ExportTraceServiceRequest.
             * @memberof outray.otlp
             * @classdesc Represents an ExportTraceServiceRequest.
             * @constructor
             * @param {outray.otlp.ExportTraceServiceRequest.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const ExportTraceServiceRequest = function (properties) {
                this.resourceSpans = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * ExportTraceServiceRequest resourceSpans.
             * @member {Array.<outray.otlp.ResourceSpans.$Properties>} resourceSpans
             * @memberof outray.otlp.ExportTraceServiceRequest
             * @instance
             */
            ExportTraceServiceRequest.prototype.resourceSpans = $util.emptyArray;

            /**
             * Creates a new ExportTraceServiceRequest instance using the specified properties.
             * @function create
             * @memberof outray.otlp.ExportTraceServiceRequest
             * @static
             * @param {outray.otlp.ExportTraceServiceRequest.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.ExportTraceServiceRequest} ExportTraceServiceRequest instance
             * @type {{
             *   (properties: outray.otlp.ExportTraceServiceRequest.$Shape): outray.otlp.ExportTraceServiceRequest & outray.otlp.ExportTraceServiceRequest.$Shape;
             *   (properties?: outray.otlp.ExportTraceServiceRequest.$Properties): outray.otlp.ExportTraceServiceRequest;
             * }}
             */
            ExportTraceServiceRequest.create = function(properties) {
                return new ExportTraceServiceRequest(properties);
            };

            /**
             * Encodes the specified ExportTraceServiceRequest message. Does not implicitly {@link outray.otlp.ExportTraceServiceRequest.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.ExportTraceServiceRequest
             * @static
             * @param {outray.otlp.ExportTraceServiceRequest.$Properties} message ExportTraceServiceRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ExportTraceServiceRequest.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.resourceSpans != null && message.resourceSpans.length)
                    for (let i = 0; i < message.resourceSpans.length; ++i)
                        $root.outray.otlp.ResourceSpans.encode(message.resourceSpans[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes an ExportTraceServiceRequest message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.ExportTraceServiceRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.ExportTraceServiceRequest & outray.otlp.ExportTraceServiceRequest.$Shape} ExportTraceServiceRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ExportTraceServiceRequest.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.ExportTraceServiceRequest();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            if (!(message.resourceSpans && message.resourceSpans.length))
                                message.resourceSpans = [];
                            message.resourceSpans.push($root.outray.otlp.ResourceSpans.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates an ExportTraceServiceRequest message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.ExportTraceServiceRequest
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.ExportTraceServiceRequest} ExportTraceServiceRequest
             */
            ExportTraceServiceRequest.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.ExportTraceServiceRequest)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.ExportTraceServiceRequest: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.ExportTraceServiceRequest();
                if (object.resourceSpans) {
                    if (!$Array.isArray(object.resourceSpans))
                        throw $TypeError(".outray.otlp.ExportTraceServiceRequest.resourceSpans: array expected");
                    message.resourceSpans = $Array(object.resourceSpans.length);
                    for (let i = 0; i < object.resourceSpans.length; ++i) {
                        if (!$util.isObject(object.resourceSpans[i]))
                            throw $TypeError(".outray.otlp.ExportTraceServiceRequest.resourceSpans: object expected");
                        message.resourceSpans[i] = $root.outray.otlp.ResourceSpans.fromObject(object.resourceSpans[i], _depth + 1);
                    }
                }
                return message;
            };

            /**
             * Creates a plain object from an ExportTraceServiceRequest message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.ExportTraceServiceRequest
             * @static
             * @param {outray.otlp.ExportTraceServiceRequest} message ExportTraceServiceRequest
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ExportTraceServiceRequest.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.resourceSpans = [];
                if (message.resourceSpans && message.resourceSpans.length) {
                    object.resourceSpans = $Array(message.resourceSpans.length);
                    for (let j = 0; j < message.resourceSpans.length; ++j)
                        object.resourceSpans[j] = $root.outray.otlp.ResourceSpans.toObject(message.resourceSpans[j], options, _depth + 1);
                }
                return object;
            };

            /**
             * Converts this ExportTraceServiceRequest to JSON.
             * @function toJSON
             * @memberof outray.otlp.ExportTraceServiceRequest
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ExportTraceServiceRequest.prototype.toJSON = function() {
                return ExportTraceServiceRequest.toObject(this, $protobuf.util.toJSONOptions);
            };

            return ExportTraceServiceRequest;
        })();

        otlp.ExportTraceServiceResponse = (function() {

            /**
             * Properties of an ExportTraceServiceResponse.
             * @typedef {Object} outray.otlp.ExportTraceServiceResponse.$Properties
             * @property {outray.otlp.ExportTracePartialSuccess.$Properties|null} [partialSuccess] ExportTraceServiceResponse partialSuccess
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of an ExportTraceServiceResponse.
             * @memberof outray.otlp
             * @interface IExportTraceServiceResponse
             * @augments outray.otlp.ExportTraceServiceResponse.$Properties
             * @deprecated Use outray.otlp.ExportTraceServiceResponse.$Properties instead.
             */

            /**
             * Shape of an ExportTraceServiceResponse.
             * @typedef {outray.otlp.ExportTraceServiceResponse.$Properties} outray.otlp.ExportTraceServiceResponse.$Shape
             */

            /**
             * Constructs a new ExportTraceServiceResponse.
             * @memberof outray.otlp
             * @classdesc Represents an ExportTraceServiceResponse.
             * @constructor
             * @param {outray.otlp.ExportTraceServiceResponse.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const ExportTraceServiceResponse = function (properties) {
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * ExportTraceServiceResponse partialSuccess.
             * @member {outray.otlp.ExportTracePartialSuccess.$Properties|null|undefined} partialSuccess
             * @memberof outray.otlp.ExportTraceServiceResponse
             * @instance
             */
            ExportTraceServiceResponse.prototype.partialSuccess = null;

            /**
             * Creates a new ExportTraceServiceResponse instance using the specified properties.
             * @function create
             * @memberof outray.otlp.ExportTraceServiceResponse
             * @static
             * @param {outray.otlp.ExportTraceServiceResponse.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.ExportTraceServiceResponse} ExportTraceServiceResponse instance
             * @type {{
             *   (properties: outray.otlp.ExportTraceServiceResponse.$Shape): outray.otlp.ExportTraceServiceResponse & outray.otlp.ExportTraceServiceResponse.$Shape;
             *   (properties?: outray.otlp.ExportTraceServiceResponse.$Properties): outray.otlp.ExportTraceServiceResponse;
             * }}
             */
            ExportTraceServiceResponse.create = function(properties) {
                return new ExportTraceServiceResponse(properties);
            };

            /**
             * Encodes the specified ExportTraceServiceResponse message. Does not implicitly {@link outray.otlp.ExportTraceServiceResponse.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.ExportTraceServiceResponse
             * @static
             * @param {outray.otlp.ExportTraceServiceResponse.$Properties} message ExportTraceServiceResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ExportTraceServiceResponse.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.partialSuccess != null && $Object.hasOwnProperty.call(message, "partialSuccess"))
                    $root.outray.otlp.ExportTracePartialSuccess.encode(message.partialSuccess, writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes an ExportTraceServiceResponse message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.ExportTraceServiceResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.ExportTraceServiceResponse & outray.otlp.ExportTraceServiceResponse.$Shape} ExportTraceServiceResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ExportTraceServiceResponse.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.ExportTraceServiceResponse();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            message.partialSuccess = $root.outray.otlp.ExportTracePartialSuccess.decode(reader, reader.uint32(), $undefined, _depth + 1, message.partialSuccess);
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates an ExportTraceServiceResponse message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.ExportTraceServiceResponse
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.ExportTraceServiceResponse} ExportTraceServiceResponse
             */
            ExportTraceServiceResponse.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.ExportTraceServiceResponse)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.ExportTraceServiceResponse: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.ExportTraceServiceResponse();
                if (object.partialSuccess != null) {
                    if (!$util.isObject(object.partialSuccess))
                        throw $TypeError(".outray.otlp.ExportTraceServiceResponse.partialSuccess: object expected");
                    message.partialSuccess = $root.outray.otlp.ExportTracePartialSuccess.fromObject(object.partialSuccess, _depth + 1);
                }
                return message;
            };

            /**
             * Creates a plain object from an ExportTraceServiceResponse message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.ExportTraceServiceResponse
             * @static
             * @param {outray.otlp.ExportTraceServiceResponse} message ExportTraceServiceResponse
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ExportTraceServiceResponse.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.defaults)
                    object.partialSuccess = null;
                if (message.partialSuccess != null && $Object.hasOwnProperty.call(message, "partialSuccess"))
                    object.partialSuccess = $root.outray.otlp.ExportTracePartialSuccess.toObject(message.partialSuccess, options, _depth + 1);
                return object;
            };

            /**
             * Converts this ExportTraceServiceResponse to JSON.
             * @function toJSON
             * @memberof outray.otlp.ExportTraceServiceResponse
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ExportTraceServiceResponse.prototype.toJSON = function() {
                return ExportTraceServiceResponse.toObject(this, $protobuf.util.toJSONOptions);
            };

            return ExportTraceServiceResponse;
        })();

        otlp.ExportTracePartialSuccess = (function() {

            /**
             * Properties of an ExportTracePartialSuccess.
             * @typedef {Object} outray.otlp.ExportTracePartialSuccess.$Properties
             * @property {number|Long|null} [rejectedSpans] ExportTracePartialSuccess rejectedSpans
             * @property {string|null} [errorMessage] ExportTracePartialSuccess errorMessage
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of an ExportTracePartialSuccess.
             * @memberof outray.otlp
             * @interface IExportTracePartialSuccess
             * @augments outray.otlp.ExportTracePartialSuccess.$Properties
             * @deprecated Use outray.otlp.ExportTracePartialSuccess.$Properties instead.
             */

            /**
             * Shape of an ExportTracePartialSuccess.
             * @typedef {outray.otlp.ExportTracePartialSuccess.$Properties} outray.otlp.ExportTracePartialSuccess.$Shape
             */

            /**
             * Constructs a new ExportTracePartialSuccess.
             * @memberof outray.otlp
             * @classdesc Represents an ExportTracePartialSuccess.
             * @constructor
             * @param {outray.otlp.ExportTracePartialSuccess.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const ExportTracePartialSuccess = function (properties) {
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * ExportTracePartialSuccess rejectedSpans.
             * @member {number|Long} rejectedSpans
             * @memberof outray.otlp.ExportTracePartialSuccess
             * @instance
             */
            ExportTracePartialSuccess.prototype.rejectedSpans = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

            /**
             * ExportTracePartialSuccess errorMessage.
             * @member {string} errorMessage
             * @memberof outray.otlp.ExportTracePartialSuccess
             * @instance
             */
            ExportTracePartialSuccess.prototype.errorMessage = "";

            /**
             * Creates a new ExportTracePartialSuccess instance using the specified properties.
             * @function create
             * @memberof outray.otlp.ExportTracePartialSuccess
             * @static
             * @param {outray.otlp.ExportTracePartialSuccess.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.ExportTracePartialSuccess} ExportTracePartialSuccess instance
             * @type {{
             *   (properties: outray.otlp.ExportTracePartialSuccess.$Shape): outray.otlp.ExportTracePartialSuccess & outray.otlp.ExportTracePartialSuccess.$Shape;
             *   (properties?: outray.otlp.ExportTracePartialSuccess.$Properties): outray.otlp.ExportTracePartialSuccess;
             * }}
             */
            ExportTracePartialSuccess.create = function(properties) {
                return new ExportTracePartialSuccess(properties);
            };

            /**
             * Encodes the specified ExportTracePartialSuccess message. Does not implicitly {@link outray.otlp.ExportTracePartialSuccess.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.ExportTracePartialSuccess
             * @static
             * @param {outray.otlp.ExportTracePartialSuccess.$Properties} message ExportTracePartialSuccess message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ExportTracePartialSuccess.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.rejectedSpans != null && $Object.hasOwnProperty.call(message, "rejectedSpans") && (typeof message.rejectedSpans === "object" ? message.rejectedSpans.low || message.rejectedSpans.high : message.rejectedSpans !== 0))
                    writer.uint32(/* id 1, wireType 0 =*/8).int64(message.rejectedSpans);
                if (message.errorMessage != null && $Object.hasOwnProperty.call(message, "errorMessage") && message.errorMessage !== "")
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.errorMessage);
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes an ExportTracePartialSuccess message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.ExportTracePartialSuccess
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.ExportTracePartialSuccess & outray.otlp.ExportTracePartialSuccess.$Shape} ExportTracePartialSuccess
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ExportTracePartialSuccess.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.ExportTracePartialSuccess();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 0)
                                break;
                            if (typeof (value = reader.int64()) === "object" ? value.low || value.high : value !== 0)
                                message.rejectedSpans = value;
                            else
                                delete message.rejectedSpans;
                            continue;
                        }
                    case 2: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.stringVerify()).length)
                                message.errorMessage = value;
                            else
                                delete message.errorMessage;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates an ExportTracePartialSuccess message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.ExportTracePartialSuccess
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.ExportTracePartialSuccess} ExportTracePartialSuccess
             */
            ExportTracePartialSuccess.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.ExportTracePartialSuccess)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.ExportTracePartialSuccess: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.ExportTracePartialSuccess();
                if (object.rejectedSpans != null)
                    if (typeof object.rejectedSpans === "object" ? object.rejectedSpans.low || object.rejectedSpans.high : $Number(object.rejectedSpans) !== 0)
                        if ($util.Long)
                            message.rejectedSpans = $util.Long.fromValue(object.rejectedSpans, false);
                        else if (typeof object.rejectedSpans === "string")
                            message.rejectedSpans = $parseInt(object.rejectedSpans, 10);
                        else if (typeof object.rejectedSpans === "number")
                            message.rejectedSpans = object.rejectedSpans;
                        else if (typeof object.rejectedSpans === "object")
                            message.rejectedSpans = new $util.LongBits(object.rejectedSpans.low >>> 0, object.rejectedSpans.high >>> 0).toNumber();
                if (object.errorMessage != null)
                    if (typeof object.errorMessage !== "string" || object.errorMessage.length)
                        message.errorMessage = $String(object.errorMessage);
                return message;
            };

            /**
             * Creates a plain object from an ExportTracePartialSuccess message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.ExportTracePartialSuccess
             * @static
             * @param {outray.otlp.ExportTracePartialSuccess} message ExportTracePartialSuccess
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ExportTracePartialSuccess.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, false);
                        object.rejectedSpans = options.longs === $String ? long.toString() : options.longs === $Number ? long.toNumber() : typeof $BigInt !== "undefined" && options.longs === $BigInt ? long.toBigInt() : long;
                    } else
                        object.rejectedSpans = options.longs === $String ? "0" : typeof $BigInt !== "undefined" && options.longs === $BigInt ? $BigInt("0") : 0;
                    object.errorMessage = "";
                }
                if (message.rejectedSpans != null && $Object.hasOwnProperty.call(message, "rejectedSpans"))
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.rejectedSpans = typeof message.rejectedSpans === "number" ? $BigInt(message.rejectedSpans) : $util.Long.fromBits(message.rejectedSpans.low >>> 0, message.rejectedSpans.high >>> 0, false).toBigInt();
                    else if (typeof message.rejectedSpans === "number")
                        object.rejectedSpans = options.longs === $String ? $String(message.rejectedSpans) : message.rejectedSpans;
                    else
                        object.rejectedSpans = options.longs === $String ? $util.Long.prototype.toString.call(message.rejectedSpans) : options.longs === $Number ? new $util.LongBits(message.rejectedSpans.low >>> 0, message.rejectedSpans.high >>> 0).toNumber() : message.rejectedSpans;
                if (message.errorMessage != null && $Object.hasOwnProperty.call(message, "errorMessage"))
                    object.errorMessage = message.errorMessage;
                return object;
            };

            /**
             * Converts this ExportTracePartialSuccess to JSON.
             * @function toJSON
             * @memberof outray.otlp.ExportTracePartialSuccess
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ExportTracePartialSuccess.prototype.toJSON = function() {
                return ExportTracePartialSuccess.toObject(this, $protobuf.util.toJSONOptions);
            };

            return ExportTracePartialSuccess;
        })();

        otlp.ResourceLogs = (function() {

            /**
             * Properties of a ResourceLogs.
             * @typedef {Object} outray.otlp.ResourceLogs.$Properties
             * @property {outray.otlp.Resource.$Properties|null} [resource] ResourceLogs resource
             * @property {Array.<outray.otlp.ScopeLogs.$Properties>|null} [scopeLogs] ResourceLogs scopeLogs
             * @property {string|null} [schemaUrl] ResourceLogs schemaUrl
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of a ResourceLogs.
             * @memberof outray.otlp
             * @interface IResourceLogs
             * @augments outray.otlp.ResourceLogs.$Properties
             * @deprecated Use outray.otlp.ResourceLogs.$Properties instead.
             */

            /**
             * Shape of a ResourceLogs.
             * @typedef {{
             *   resource?: outray.otlp.Resource.$Shape|null;
             *   scopeLogs?: Array.<outray.otlp.ScopeLogs.$Shape>|null;
             *   schemaUrl?: string|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.ResourceLogs.$Shape
             */

            /**
             * Constructs a new ResourceLogs.
             * @memberof outray.otlp
             * @classdesc Represents a ResourceLogs.
             * @constructor
             * @param {outray.otlp.ResourceLogs.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const ResourceLogs = function (properties) {
                this.scopeLogs = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * ResourceLogs resource.
             * @member {outray.otlp.Resource.$Properties|null|undefined} resource
             * @memberof outray.otlp.ResourceLogs
             * @instance
             */
            ResourceLogs.prototype.resource = null;

            /**
             * ResourceLogs scopeLogs.
             * @member {Array.<outray.otlp.ScopeLogs.$Properties>} scopeLogs
             * @memberof outray.otlp.ResourceLogs
             * @instance
             */
            ResourceLogs.prototype.scopeLogs = $util.emptyArray;

            /**
             * ResourceLogs schemaUrl.
             * @member {string} schemaUrl
             * @memberof outray.otlp.ResourceLogs
             * @instance
             */
            ResourceLogs.prototype.schemaUrl = "";

            /**
             * Creates a new ResourceLogs instance using the specified properties.
             * @function create
             * @memberof outray.otlp.ResourceLogs
             * @static
             * @param {outray.otlp.ResourceLogs.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.ResourceLogs} ResourceLogs instance
             * @type {{
             *   (properties: outray.otlp.ResourceLogs.$Shape): outray.otlp.ResourceLogs & outray.otlp.ResourceLogs.$Shape;
             *   (properties?: outray.otlp.ResourceLogs.$Properties): outray.otlp.ResourceLogs;
             * }}
             */
            ResourceLogs.create = function(properties) {
                return new ResourceLogs(properties);
            };

            /**
             * Encodes the specified ResourceLogs message. Does not implicitly {@link outray.otlp.ResourceLogs.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.ResourceLogs
             * @static
             * @param {outray.otlp.ResourceLogs.$Properties} message ResourceLogs message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ResourceLogs.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.resource != null && $Object.hasOwnProperty.call(message, "resource"))
                    $root.outray.otlp.Resource.encode(message.resource, writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
                if (message.scopeLogs != null && message.scopeLogs.length)
                    for (let i = 0; i < message.scopeLogs.length; ++i)
                        $root.outray.otlp.ScopeLogs.encode(message.scopeLogs[i], writer.uint32(/* id 2, wireType 2 =*/18).fork(), _depth + 1).ldelim();
                if (message.schemaUrl != null && $Object.hasOwnProperty.call(message, "schemaUrl") && message.schemaUrl !== "")
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.schemaUrl);
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes a ResourceLogs message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.ResourceLogs
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.ResourceLogs & outray.otlp.ResourceLogs.$Shape} ResourceLogs
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ResourceLogs.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.ResourceLogs();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            message.resource = $root.outray.otlp.Resource.decode(reader, reader.uint32(), $undefined, _depth + 1, message.resource);
                            continue;
                        }
                    case 2: {
                            if (wireType !== 2)
                                break;
                            if (!(message.scopeLogs && message.scopeLogs.length))
                                message.scopeLogs = [];
                            message.scopeLogs.push($root.outray.otlp.ScopeLogs.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 3: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.stringVerify()).length)
                                message.schemaUrl = value;
                            else
                                delete message.schemaUrl;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates a ResourceLogs message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.ResourceLogs
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.ResourceLogs} ResourceLogs
             */
            ResourceLogs.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.ResourceLogs)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.ResourceLogs: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.ResourceLogs();
                if (object.resource != null) {
                    if (!$util.isObject(object.resource))
                        throw $TypeError(".outray.otlp.ResourceLogs.resource: object expected");
                    message.resource = $root.outray.otlp.Resource.fromObject(object.resource, _depth + 1);
                }
                if (object.scopeLogs) {
                    if (!$Array.isArray(object.scopeLogs))
                        throw $TypeError(".outray.otlp.ResourceLogs.scopeLogs: array expected");
                    message.scopeLogs = $Array(object.scopeLogs.length);
                    for (let i = 0; i < object.scopeLogs.length; ++i) {
                        if (!$util.isObject(object.scopeLogs[i]))
                            throw $TypeError(".outray.otlp.ResourceLogs.scopeLogs: object expected");
                        message.scopeLogs[i] = $root.outray.otlp.ScopeLogs.fromObject(object.scopeLogs[i], _depth + 1);
                    }
                }
                if (object.schemaUrl != null)
                    if (typeof object.schemaUrl !== "string" || object.schemaUrl.length)
                        message.schemaUrl = $String(object.schemaUrl);
                return message;
            };

            /**
             * Creates a plain object from a ResourceLogs message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.ResourceLogs
             * @static
             * @param {outray.otlp.ResourceLogs} message ResourceLogs
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ResourceLogs.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.scopeLogs = [];
                if (options.defaults) {
                    object.resource = null;
                    object.schemaUrl = "";
                }
                if (message.resource != null && $Object.hasOwnProperty.call(message, "resource"))
                    object.resource = $root.outray.otlp.Resource.toObject(message.resource, options, _depth + 1);
                if (message.scopeLogs && message.scopeLogs.length) {
                    object.scopeLogs = $Array(message.scopeLogs.length);
                    for (let j = 0; j < message.scopeLogs.length; ++j)
                        object.scopeLogs[j] = $root.outray.otlp.ScopeLogs.toObject(message.scopeLogs[j], options, _depth + 1);
                }
                if (message.schemaUrl != null && $Object.hasOwnProperty.call(message, "schemaUrl"))
                    object.schemaUrl = message.schemaUrl;
                return object;
            };

            /**
             * Converts this ResourceLogs to JSON.
             * @function toJSON
             * @memberof outray.otlp.ResourceLogs
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ResourceLogs.prototype.toJSON = function() {
                return ResourceLogs.toObject(this, $protobuf.util.toJSONOptions);
            };

            return ResourceLogs;
        })();

        otlp.ScopeLogs = (function() {

            /**
             * Properties of a ScopeLogs.
             * @typedef {Object} outray.otlp.ScopeLogs.$Properties
             * @property {outray.otlp.InstrumentationScope.$Properties|null} [scope] ScopeLogs scope
             * @property {Array.<outray.otlp.LogRecord.$Properties>|null} [logRecords] ScopeLogs logRecords
             * @property {string|null} [schemaUrl] ScopeLogs schemaUrl
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of a ScopeLogs.
             * @memberof outray.otlp
             * @interface IScopeLogs
             * @augments outray.otlp.ScopeLogs.$Properties
             * @deprecated Use outray.otlp.ScopeLogs.$Properties instead.
             */

            /**
             * Shape of a ScopeLogs.
             * @typedef {{
             *   scope?: outray.otlp.InstrumentationScope.$Shape|null;
             *   logRecords?: Array.<outray.otlp.LogRecord.$Shape>|null;
             *   schemaUrl?: string|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.ScopeLogs.$Shape
             */

            /**
             * Constructs a new ScopeLogs.
             * @memberof outray.otlp
             * @classdesc Represents a ScopeLogs.
             * @constructor
             * @param {outray.otlp.ScopeLogs.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const ScopeLogs = function (properties) {
                this.logRecords = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * ScopeLogs scope.
             * @member {outray.otlp.InstrumentationScope.$Properties|null|undefined} scope
             * @memberof outray.otlp.ScopeLogs
             * @instance
             */
            ScopeLogs.prototype.scope = null;

            /**
             * ScopeLogs logRecords.
             * @member {Array.<outray.otlp.LogRecord.$Properties>} logRecords
             * @memberof outray.otlp.ScopeLogs
             * @instance
             */
            ScopeLogs.prototype.logRecords = $util.emptyArray;

            /**
             * ScopeLogs schemaUrl.
             * @member {string} schemaUrl
             * @memberof outray.otlp.ScopeLogs
             * @instance
             */
            ScopeLogs.prototype.schemaUrl = "";

            /**
             * Creates a new ScopeLogs instance using the specified properties.
             * @function create
             * @memberof outray.otlp.ScopeLogs
             * @static
             * @param {outray.otlp.ScopeLogs.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.ScopeLogs} ScopeLogs instance
             * @type {{
             *   (properties: outray.otlp.ScopeLogs.$Shape): outray.otlp.ScopeLogs & outray.otlp.ScopeLogs.$Shape;
             *   (properties?: outray.otlp.ScopeLogs.$Properties): outray.otlp.ScopeLogs;
             * }}
             */
            ScopeLogs.create = function(properties) {
                return new ScopeLogs(properties);
            };

            /**
             * Encodes the specified ScopeLogs message. Does not implicitly {@link outray.otlp.ScopeLogs.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.ScopeLogs
             * @static
             * @param {outray.otlp.ScopeLogs.$Properties} message ScopeLogs message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ScopeLogs.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.scope != null && $Object.hasOwnProperty.call(message, "scope"))
                    $root.outray.otlp.InstrumentationScope.encode(message.scope, writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
                if (message.logRecords != null && message.logRecords.length)
                    for (let i = 0; i < message.logRecords.length; ++i)
                        $root.outray.otlp.LogRecord.encode(message.logRecords[i], writer.uint32(/* id 2, wireType 2 =*/18).fork(), _depth + 1).ldelim();
                if (message.schemaUrl != null && $Object.hasOwnProperty.call(message, "schemaUrl") && message.schemaUrl !== "")
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.schemaUrl);
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes a ScopeLogs message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.ScopeLogs
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.ScopeLogs & outray.otlp.ScopeLogs.$Shape} ScopeLogs
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ScopeLogs.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.ScopeLogs();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            message.scope = $root.outray.otlp.InstrumentationScope.decode(reader, reader.uint32(), $undefined, _depth + 1, message.scope);
                            continue;
                        }
                    case 2: {
                            if (wireType !== 2)
                                break;
                            if (!(message.logRecords && message.logRecords.length))
                                message.logRecords = [];
                            message.logRecords.push($root.outray.otlp.LogRecord.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 3: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.stringVerify()).length)
                                message.schemaUrl = value;
                            else
                                delete message.schemaUrl;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates a ScopeLogs message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.ScopeLogs
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.ScopeLogs} ScopeLogs
             */
            ScopeLogs.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.ScopeLogs)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.ScopeLogs: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.ScopeLogs();
                if (object.scope != null) {
                    if (!$util.isObject(object.scope))
                        throw $TypeError(".outray.otlp.ScopeLogs.scope: object expected");
                    message.scope = $root.outray.otlp.InstrumentationScope.fromObject(object.scope, _depth + 1);
                }
                if (object.logRecords) {
                    if (!$Array.isArray(object.logRecords))
                        throw $TypeError(".outray.otlp.ScopeLogs.logRecords: array expected");
                    message.logRecords = $Array(object.logRecords.length);
                    for (let i = 0; i < object.logRecords.length; ++i) {
                        if (!$util.isObject(object.logRecords[i]))
                            throw $TypeError(".outray.otlp.ScopeLogs.logRecords: object expected");
                        message.logRecords[i] = $root.outray.otlp.LogRecord.fromObject(object.logRecords[i], _depth + 1);
                    }
                }
                if (object.schemaUrl != null)
                    if (typeof object.schemaUrl !== "string" || object.schemaUrl.length)
                        message.schemaUrl = $String(object.schemaUrl);
                return message;
            };

            /**
             * Creates a plain object from a ScopeLogs message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.ScopeLogs
             * @static
             * @param {outray.otlp.ScopeLogs} message ScopeLogs
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ScopeLogs.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.logRecords = [];
                if (options.defaults) {
                    object.scope = null;
                    object.schemaUrl = "";
                }
                if (message.scope != null && $Object.hasOwnProperty.call(message, "scope"))
                    object.scope = $root.outray.otlp.InstrumentationScope.toObject(message.scope, options, _depth + 1);
                if (message.logRecords && message.logRecords.length) {
                    object.logRecords = $Array(message.logRecords.length);
                    for (let j = 0; j < message.logRecords.length; ++j)
                        object.logRecords[j] = $root.outray.otlp.LogRecord.toObject(message.logRecords[j], options, _depth + 1);
                }
                if (message.schemaUrl != null && $Object.hasOwnProperty.call(message, "schemaUrl"))
                    object.schemaUrl = message.schemaUrl;
                return object;
            };

            /**
             * Converts this ScopeLogs to JSON.
             * @function toJSON
             * @memberof outray.otlp.ScopeLogs
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ScopeLogs.prototype.toJSON = function() {
                return ScopeLogs.toObject(this, $protobuf.util.toJSONOptions);
            };

            return ScopeLogs;
        })();

        otlp.LogRecord = (function() {

            /**
             * Properties of a LogRecord.
             * @typedef {Object} outray.otlp.LogRecord.$Properties
             * @property {number|Long|null} [timeUnixNano] LogRecord timeUnixNano
             * @property {number|null} [severityNumber] LogRecord severityNumber
             * @property {string|null} [severityText] LogRecord severityText
             * @property {outray.otlp.AnyValue.$Properties|null} [body] LogRecord body
             * @property {Array.<outray.otlp.KeyValue.$Properties>|null} [attributes] LogRecord attributes
             * @property {number|null} [droppedAttributesCount] LogRecord droppedAttributesCount
             * @property {number|null} [flags] LogRecord flags
             * @property {Uint8Array|null} [traceId] LogRecord traceId
             * @property {Uint8Array|null} [spanId] LogRecord spanId
             * @property {number|Long|null} [observedTimeUnixNano] LogRecord observedTimeUnixNano
             * @property {string|null} [eventName] LogRecord eventName
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of a LogRecord.
             * @memberof outray.otlp
             * @interface ILogRecord
             * @augments outray.otlp.LogRecord.$Properties
             * @deprecated Use outray.otlp.LogRecord.$Properties instead.
             */

            /**
             * Shape of a LogRecord.
             * @typedef {{
             *   timeUnixNano?: number|Long|null;
             *   severityNumber?: number|null;
             *   severityText?: string|null;
             *   body?: outray.otlp.AnyValue.$Shape|null;
             *   attributes?: Array.<outray.otlp.KeyValue.$Shape>|null;
             *   droppedAttributesCount?: number|null;
             *   flags?: number|null;
             *   traceId?: Uint8Array|null;
             *   spanId?: Uint8Array|null;
             *   observedTimeUnixNano?: number|Long|null;
             *   eventName?: string|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.LogRecord.$Shape
             */

            /**
             * Constructs a new LogRecord.
             * @memberof outray.otlp
             * @classdesc Represents a LogRecord.
             * @constructor
             * @param {outray.otlp.LogRecord.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const LogRecord = function (properties) {
                this.attributes = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * LogRecord timeUnixNano.
             * @member {number|Long} timeUnixNano
             * @memberof outray.otlp.LogRecord
             * @instance
             */
            LogRecord.prototype.timeUnixNano = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * LogRecord severityNumber.
             * @member {number} severityNumber
             * @memberof outray.otlp.LogRecord
             * @instance
             */
            LogRecord.prototype.severityNumber = 0;

            /**
             * LogRecord severityText.
             * @member {string} severityText
             * @memberof outray.otlp.LogRecord
             * @instance
             */
            LogRecord.prototype.severityText = "";

            /**
             * LogRecord body.
             * @member {outray.otlp.AnyValue.$Properties|null|undefined} body
             * @memberof outray.otlp.LogRecord
             * @instance
             */
            LogRecord.prototype.body = null;

            /**
             * LogRecord attributes.
             * @member {Array.<outray.otlp.KeyValue.$Properties>} attributes
             * @memberof outray.otlp.LogRecord
             * @instance
             */
            LogRecord.prototype.attributes = $util.emptyArray;

            /**
             * LogRecord droppedAttributesCount.
             * @member {number} droppedAttributesCount
             * @memberof outray.otlp.LogRecord
             * @instance
             */
            LogRecord.prototype.droppedAttributesCount = 0;

            /**
             * LogRecord flags.
             * @member {number} flags
             * @memberof outray.otlp.LogRecord
             * @instance
             */
            LogRecord.prototype.flags = 0;

            /**
             * LogRecord traceId.
             * @member {Uint8Array} traceId
             * @memberof outray.otlp.LogRecord
             * @instance
             */
            LogRecord.prototype.traceId = $util.newBuffer([]);

            /**
             * LogRecord spanId.
             * @member {Uint8Array} spanId
             * @memberof outray.otlp.LogRecord
             * @instance
             */
            LogRecord.prototype.spanId = $util.newBuffer([]);

            /**
             * LogRecord observedTimeUnixNano.
             * @member {number|Long} observedTimeUnixNano
             * @memberof outray.otlp.LogRecord
             * @instance
             */
            LogRecord.prototype.observedTimeUnixNano = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * LogRecord eventName.
             * @member {string} eventName
             * @memberof outray.otlp.LogRecord
             * @instance
             */
            LogRecord.prototype.eventName = "";

            /**
             * Creates a new LogRecord instance using the specified properties.
             * @function create
             * @memberof outray.otlp.LogRecord
             * @static
             * @param {outray.otlp.LogRecord.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.LogRecord} LogRecord instance
             * @type {{
             *   (properties: outray.otlp.LogRecord.$Shape): outray.otlp.LogRecord & outray.otlp.LogRecord.$Shape;
             *   (properties?: outray.otlp.LogRecord.$Properties): outray.otlp.LogRecord;
             * }}
             */
            LogRecord.create = function(properties) {
                return new LogRecord(properties);
            };

            /**
             * Encodes the specified LogRecord message. Does not implicitly {@link outray.otlp.LogRecord.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.LogRecord
             * @static
             * @param {outray.otlp.LogRecord.$Properties} message LogRecord message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            LogRecord.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.timeUnixNano != null && $Object.hasOwnProperty.call(message, "timeUnixNano") && (typeof message.timeUnixNano === "object" ? message.timeUnixNano.low || message.timeUnixNano.high : message.timeUnixNano !== 0))
                    writer.uint32(/* id 1, wireType 1 =*/9).fixed64(message.timeUnixNano);
                if (message.severityNumber != null && $Object.hasOwnProperty.call(message, "severityNumber") && message.severityNumber !== 0)
                    writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.severityNumber);
                if (message.severityText != null && $Object.hasOwnProperty.call(message, "severityText") && message.severityText !== "")
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.severityText);
                if (message.body != null && $Object.hasOwnProperty.call(message, "body"))
                    $root.outray.otlp.AnyValue.encode(message.body, writer.uint32(/* id 5, wireType 2 =*/42).fork(), _depth + 1).ldelim();
                if (message.attributes != null && message.attributes.length)
                    for (let i = 0; i < message.attributes.length; ++i)
                        $root.outray.otlp.KeyValue.encode(message.attributes[i], writer.uint32(/* id 6, wireType 2 =*/50).fork(), _depth + 1).ldelim();
                if (message.droppedAttributesCount != null && $Object.hasOwnProperty.call(message, "droppedAttributesCount") && message.droppedAttributesCount !== 0)
                    writer.uint32(/* id 7, wireType 0 =*/56).uint32(message.droppedAttributesCount);
                if (message.flags != null && $Object.hasOwnProperty.call(message, "flags") && message.flags !== 0)
                    writer.uint32(/* id 8, wireType 5 =*/69).fixed32(message.flags);
                if (message.traceId != null && $Object.hasOwnProperty.call(message, "traceId") && message.traceId.length)
                    writer.uint32(/* id 9, wireType 2 =*/74).bytes(message.traceId);
                if (message.spanId != null && $Object.hasOwnProperty.call(message, "spanId") && message.spanId.length)
                    writer.uint32(/* id 10, wireType 2 =*/82).bytes(message.spanId);
                if (message.observedTimeUnixNano != null && $Object.hasOwnProperty.call(message, "observedTimeUnixNano") && (typeof message.observedTimeUnixNano === "object" ? message.observedTimeUnixNano.low || message.observedTimeUnixNano.high : message.observedTimeUnixNano !== 0))
                    writer.uint32(/* id 11, wireType 1 =*/89).fixed64(message.observedTimeUnixNano);
                if (message.eventName != null && $Object.hasOwnProperty.call(message, "eventName") && message.eventName !== "")
                    writer.uint32(/* id 12, wireType 2 =*/98).string(message.eventName);
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes a LogRecord message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.LogRecord
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.LogRecord & outray.otlp.LogRecord.$Shape} LogRecord
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            LogRecord.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.LogRecord();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 1)
                                break;
                            if (typeof (value = reader.fixed64()) === "object" ? value.low || value.high : value !== 0)
                                message.timeUnixNano = value;
                            else
                                delete message.timeUnixNano;
                            continue;
                        }
                    case 2: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.uint32())
                                message.severityNumber = value;
                            else
                                delete message.severityNumber;
                            continue;
                        }
                    case 3: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.stringVerify()).length)
                                message.severityText = value;
                            else
                                delete message.severityText;
                            continue;
                        }
                    case 5: {
                            if (wireType !== 2)
                                break;
                            message.body = $root.outray.otlp.AnyValue.decode(reader, reader.uint32(), $undefined, _depth + 1, message.body);
                            continue;
                        }
                    case 6: {
                            if (wireType !== 2)
                                break;
                            if (!(message.attributes && message.attributes.length))
                                message.attributes = [];
                            message.attributes.push($root.outray.otlp.KeyValue.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 7: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.uint32())
                                message.droppedAttributesCount = value;
                            else
                                delete message.droppedAttributesCount;
                            continue;
                        }
                    case 8: {
                            if (wireType !== 5)
                                break;
                            if (value = reader.fixed32())
                                message.flags = value;
                            else
                                delete message.flags;
                            continue;
                        }
                    case 9: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.bytes()).length)
                                message.traceId = value;
                            else
                                delete message.traceId;
                            continue;
                        }
                    case 10: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.bytes()).length)
                                message.spanId = value;
                            else
                                delete message.spanId;
                            continue;
                        }
                    case 11: {
                            if (wireType !== 1)
                                break;
                            if (typeof (value = reader.fixed64()) === "object" ? value.low || value.high : value !== 0)
                                message.observedTimeUnixNano = value;
                            else
                                delete message.observedTimeUnixNano;
                            continue;
                        }
                    case 12: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.stringVerify()).length)
                                message.eventName = value;
                            else
                                delete message.eventName;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates a LogRecord message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.LogRecord
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.LogRecord} LogRecord
             */
            LogRecord.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.LogRecord)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.LogRecord: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.LogRecord();
                if (object.timeUnixNano != null)
                    if (typeof object.timeUnixNano === "object" ? object.timeUnixNano.low || object.timeUnixNano.high : $Number(object.timeUnixNano) !== 0)
                        if ($util.Long)
                            message.timeUnixNano = $util.Long.fromValue(object.timeUnixNano, true);
                        else if (typeof object.timeUnixNano === "string")
                            message.timeUnixNano = $parseInt(object.timeUnixNano, 10);
                        else if (typeof object.timeUnixNano === "number")
                            message.timeUnixNano = object.timeUnixNano;
                        else if (typeof object.timeUnixNano === "object")
                            message.timeUnixNano = new $util.LongBits(object.timeUnixNano.low >>> 0, object.timeUnixNano.high >>> 0).toNumber(true);
                if (object.severityNumber != null)
                    if ($Number(object.severityNumber) !== 0)
                        message.severityNumber = object.severityNumber >>> 0;
                if (object.severityText != null)
                    if (typeof object.severityText !== "string" || object.severityText.length)
                        message.severityText = $String(object.severityText);
                if (object.body != null) {
                    if (!$util.isObject(object.body))
                        throw $TypeError(".outray.otlp.LogRecord.body: object expected");
                    message.body = $root.outray.otlp.AnyValue.fromObject(object.body, _depth + 1);
                }
                if (object.attributes) {
                    if (!$Array.isArray(object.attributes))
                        throw $TypeError(".outray.otlp.LogRecord.attributes: array expected");
                    message.attributes = $Array(object.attributes.length);
                    for (let i = 0; i < object.attributes.length; ++i) {
                        if (!$util.isObject(object.attributes[i]))
                            throw $TypeError(".outray.otlp.LogRecord.attributes: object expected");
                        message.attributes[i] = $root.outray.otlp.KeyValue.fromObject(object.attributes[i], _depth + 1);
                    }
                }
                if (object.droppedAttributesCount != null)
                    if ($Number(object.droppedAttributesCount) !== 0)
                        message.droppedAttributesCount = object.droppedAttributesCount >>> 0;
                if (object.flags != null)
                    if ($Number(object.flags) !== 0)
                        message.flags = object.flags >>> 0;
                if (object.traceId != null)
                    if (object.traceId.length)
                        if (typeof object.traceId === "string")
                            $util.base64.decode(object.traceId, message.traceId = $util.newBuffer($util.base64.length(object.traceId)), 0);
                        else if (object.traceId.length >= 0)
                            message.traceId = object.traceId;
                if (object.spanId != null)
                    if (object.spanId.length)
                        if (typeof object.spanId === "string")
                            $util.base64.decode(object.spanId, message.spanId = $util.newBuffer($util.base64.length(object.spanId)), 0);
                        else if (object.spanId.length >= 0)
                            message.spanId = object.spanId;
                if (object.observedTimeUnixNano != null)
                    if (typeof object.observedTimeUnixNano === "object" ? object.observedTimeUnixNano.low || object.observedTimeUnixNano.high : $Number(object.observedTimeUnixNano) !== 0)
                        if ($util.Long)
                            message.observedTimeUnixNano = $util.Long.fromValue(object.observedTimeUnixNano, true);
                        else if (typeof object.observedTimeUnixNano === "string")
                            message.observedTimeUnixNano = $parseInt(object.observedTimeUnixNano, 10);
                        else if (typeof object.observedTimeUnixNano === "number")
                            message.observedTimeUnixNano = object.observedTimeUnixNano;
                        else if (typeof object.observedTimeUnixNano === "object")
                            message.observedTimeUnixNano = new $util.LongBits(object.observedTimeUnixNano.low >>> 0, object.observedTimeUnixNano.high >>> 0).toNumber(true);
                if (object.eventName != null)
                    if (typeof object.eventName !== "string" || object.eventName.length)
                        message.eventName = $String(object.eventName);
                return message;
            };

            /**
             * Creates a plain object from a LogRecord message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.LogRecord
             * @static
             * @param {outray.otlp.LogRecord} message LogRecord
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            LogRecord.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.attributes = [];
                if (options.defaults) {
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, true);
                        object.timeUnixNano = options.longs === $String ? long.toString() : options.longs === $Number ? long.toNumber() : typeof $BigInt !== "undefined" && options.longs === $BigInt ? long.toBigInt() : long;
                    } else
                        object.timeUnixNano = options.longs === $String ? "0" : typeof $BigInt !== "undefined" && options.longs === $BigInt ? $BigInt("0") : 0;
                    object.severityNumber = 0;
                    object.severityText = "";
                    object.body = null;
                    object.droppedAttributesCount = 0;
                    object.flags = 0;
                    if (options.bytes === $String)
                        object.traceId = "";
                    else {
                        object.traceId = [];
                        if (options.bytes !== $Array)
                            object.traceId = $util.newBuffer(object.traceId);
                    }
                    if (options.bytes === $String)
                        object.spanId = "";
                    else {
                        object.spanId = [];
                        if (options.bytes !== $Array)
                            object.spanId = $util.newBuffer(object.spanId);
                    }
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, true);
                        object.observedTimeUnixNano = options.longs === $String ? long.toString() : options.longs === $Number ? long.toNumber() : typeof $BigInt !== "undefined" && options.longs === $BigInt ? long.toBigInt() : long;
                    } else
                        object.observedTimeUnixNano = options.longs === $String ? "0" : typeof $BigInt !== "undefined" && options.longs === $BigInt ? $BigInt("0") : 0;
                    object.eventName = "";
                }
                if (message.timeUnixNano != null && $Object.hasOwnProperty.call(message, "timeUnixNano"))
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.timeUnixNano = typeof message.timeUnixNano === "number" ? $BigInt(message.timeUnixNano) : $util.Long.fromBits(message.timeUnixNano.low >>> 0, message.timeUnixNano.high >>> 0, true).toBigInt();
                    else if (typeof message.timeUnixNano === "number")
                        object.timeUnixNano = options.longs === $String ? $String(message.timeUnixNano) : message.timeUnixNano;
                    else
                        object.timeUnixNano = options.longs === $String ? $util.Long.prototype.toString.call(message.timeUnixNano) : options.longs === $Number ? new $util.LongBits(message.timeUnixNano.low >>> 0, message.timeUnixNano.high >>> 0).toNumber(true) : message.timeUnixNano;
                if (message.severityNumber != null && $Object.hasOwnProperty.call(message, "severityNumber"))
                    object.severityNumber = message.severityNumber;
                if (message.severityText != null && $Object.hasOwnProperty.call(message, "severityText"))
                    object.severityText = message.severityText;
                if (message.body != null && $Object.hasOwnProperty.call(message, "body"))
                    object.body = $root.outray.otlp.AnyValue.toObject(message.body, options, _depth + 1);
                if (message.attributes && message.attributes.length) {
                    object.attributes = $Array(message.attributes.length);
                    for (let j = 0; j < message.attributes.length; ++j)
                        object.attributes[j] = $root.outray.otlp.KeyValue.toObject(message.attributes[j], options, _depth + 1);
                }
                if (message.droppedAttributesCount != null && $Object.hasOwnProperty.call(message, "droppedAttributesCount"))
                    object.droppedAttributesCount = message.droppedAttributesCount;
                if (message.flags != null && $Object.hasOwnProperty.call(message, "flags"))
                    object.flags = message.flags;
                if (message.traceId != null && $Object.hasOwnProperty.call(message, "traceId"))
                    object.traceId = options.bytes === $String ? $util.base64.encode(message.traceId, 0, message.traceId.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.traceId) : message.traceId;
                if (message.spanId != null && $Object.hasOwnProperty.call(message, "spanId"))
                    object.spanId = options.bytes === $String ? $util.base64.encode(message.spanId, 0, message.spanId.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.spanId) : message.spanId;
                if (message.observedTimeUnixNano != null && $Object.hasOwnProperty.call(message, "observedTimeUnixNano"))
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.observedTimeUnixNano = typeof message.observedTimeUnixNano === "number" ? $BigInt(message.observedTimeUnixNano) : $util.Long.fromBits(message.observedTimeUnixNano.low >>> 0, message.observedTimeUnixNano.high >>> 0, true).toBigInt();
                    else if (typeof message.observedTimeUnixNano === "number")
                        object.observedTimeUnixNano = options.longs === $String ? $String(message.observedTimeUnixNano) : message.observedTimeUnixNano;
                    else
                        object.observedTimeUnixNano = options.longs === $String ? $util.Long.prototype.toString.call(message.observedTimeUnixNano) : options.longs === $Number ? new $util.LongBits(message.observedTimeUnixNano.low >>> 0, message.observedTimeUnixNano.high >>> 0).toNumber(true) : message.observedTimeUnixNano;
                if (message.eventName != null && $Object.hasOwnProperty.call(message, "eventName"))
                    object.eventName = message.eventName;
                return object;
            };

            /**
             * Converts this LogRecord to JSON.
             * @function toJSON
             * @memberof outray.otlp.LogRecord
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            LogRecord.prototype.toJSON = function() {
                return LogRecord.toObject(this, $protobuf.util.toJSONOptions);
            };

            return LogRecord;
        })();

        otlp.ExportLogsServiceRequest = (function() {

            /**
             * Properties of an ExportLogsServiceRequest.
             * @typedef {Object} outray.otlp.ExportLogsServiceRequest.$Properties
             * @property {Array.<outray.otlp.ResourceLogs.$Properties>|null} [resourceLogs] ExportLogsServiceRequest resourceLogs
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of an ExportLogsServiceRequest.
             * @memberof outray.otlp
             * @interface IExportLogsServiceRequest
             * @augments outray.otlp.ExportLogsServiceRequest.$Properties
             * @deprecated Use outray.otlp.ExportLogsServiceRequest.$Properties instead.
             */

            /**
             * Shape of an ExportLogsServiceRequest.
             * @typedef {{
             *   resourceLogs?: Array.<outray.otlp.ResourceLogs.$Shape>|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.ExportLogsServiceRequest.$Shape
             */

            /**
             * Constructs a new ExportLogsServiceRequest.
             * @memberof outray.otlp
             * @classdesc Represents an ExportLogsServiceRequest.
             * @constructor
             * @param {outray.otlp.ExportLogsServiceRequest.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const ExportLogsServiceRequest = function (properties) {
                this.resourceLogs = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * ExportLogsServiceRequest resourceLogs.
             * @member {Array.<outray.otlp.ResourceLogs.$Properties>} resourceLogs
             * @memberof outray.otlp.ExportLogsServiceRequest
             * @instance
             */
            ExportLogsServiceRequest.prototype.resourceLogs = $util.emptyArray;

            /**
             * Creates a new ExportLogsServiceRequest instance using the specified properties.
             * @function create
             * @memberof outray.otlp.ExportLogsServiceRequest
             * @static
             * @param {outray.otlp.ExportLogsServiceRequest.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.ExportLogsServiceRequest} ExportLogsServiceRequest instance
             * @type {{
             *   (properties: outray.otlp.ExportLogsServiceRequest.$Shape): outray.otlp.ExportLogsServiceRequest & outray.otlp.ExportLogsServiceRequest.$Shape;
             *   (properties?: outray.otlp.ExportLogsServiceRequest.$Properties): outray.otlp.ExportLogsServiceRequest;
             * }}
             */
            ExportLogsServiceRequest.create = function(properties) {
                return new ExportLogsServiceRequest(properties);
            };

            /**
             * Encodes the specified ExportLogsServiceRequest message. Does not implicitly {@link outray.otlp.ExportLogsServiceRequest.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.ExportLogsServiceRequest
             * @static
             * @param {outray.otlp.ExportLogsServiceRequest.$Properties} message ExportLogsServiceRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ExportLogsServiceRequest.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.resourceLogs != null && message.resourceLogs.length)
                    for (let i = 0; i < message.resourceLogs.length; ++i)
                        $root.outray.otlp.ResourceLogs.encode(message.resourceLogs[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes an ExportLogsServiceRequest message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.ExportLogsServiceRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.ExportLogsServiceRequest & outray.otlp.ExportLogsServiceRequest.$Shape} ExportLogsServiceRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ExportLogsServiceRequest.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.ExportLogsServiceRequest();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            if (!(message.resourceLogs && message.resourceLogs.length))
                                message.resourceLogs = [];
                            message.resourceLogs.push($root.outray.otlp.ResourceLogs.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates an ExportLogsServiceRequest message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.ExportLogsServiceRequest
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.ExportLogsServiceRequest} ExportLogsServiceRequest
             */
            ExportLogsServiceRequest.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.ExportLogsServiceRequest)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.ExportLogsServiceRequest: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.ExportLogsServiceRequest();
                if (object.resourceLogs) {
                    if (!$Array.isArray(object.resourceLogs))
                        throw $TypeError(".outray.otlp.ExportLogsServiceRequest.resourceLogs: array expected");
                    message.resourceLogs = $Array(object.resourceLogs.length);
                    for (let i = 0; i < object.resourceLogs.length; ++i) {
                        if (!$util.isObject(object.resourceLogs[i]))
                            throw $TypeError(".outray.otlp.ExportLogsServiceRequest.resourceLogs: object expected");
                        message.resourceLogs[i] = $root.outray.otlp.ResourceLogs.fromObject(object.resourceLogs[i], _depth + 1);
                    }
                }
                return message;
            };

            /**
             * Creates a plain object from an ExportLogsServiceRequest message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.ExportLogsServiceRequest
             * @static
             * @param {outray.otlp.ExportLogsServiceRequest} message ExportLogsServiceRequest
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ExportLogsServiceRequest.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.resourceLogs = [];
                if (message.resourceLogs && message.resourceLogs.length) {
                    object.resourceLogs = $Array(message.resourceLogs.length);
                    for (let j = 0; j < message.resourceLogs.length; ++j)
                        object.resourceLogs[j] = $root.outray.otlp.ResourceLogs.toObject(message.resourceLogs[j], options, _depth + 1);
                }
                return object;
            };

            /**
             * Converts this ExportLogsServiceRequest to JSON.
             * @function toJSON
             * @memberof outray.otlp.ExportLogsServiceRequest
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ExportLogsServiceRequest.prototype.toJSON = function() {
                return ExportLogsServiceRequest.toObject(this, $protobuf.util.toJSONOptions);
            };

            return ExportLogsServiceRequest;
        })();

        otlp.ExportLogsServiceResponse = (function() {

            /**
             * Properties of an ExportLogsServiceResponse.
             * @typedef {Object} outray.otlp.ExportLogsServiceResponse.$Properties
             * @property {outray.otlp.ExportLogsPartialSuccess.$Properties|null} [partialSuccess] ExportLogsServiceResponse partialSuccess
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of an ExportLogsServiceResponse.
             * @memberof outray.otlp
             * @interface IExportLogsServiceResponse
             * @augments outray.otlp.ExportLogsServiceResponse.$Properties
             * @deprecated Use outray.otlp.ExportLogsServiceResponse.$Properties instead.
             */

            /**
             * Shape of an ExportLogsServiceResponse.
             * @typedef {outray.otlp.ExportLogsServiceResponse.$Properties} outray.otlp.ExportLogsServiceResponse.$Shape
             */

            /**
             * Constructs a new ExportLogsServiceResponse.
             * @memberof outray.otlp
             * @classdesc Represents an ExportLogsServiceResponse.
             * @constructor
             * @param {outray.otlp.ExportLogsServiceResponse.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const ExportLogsServiceResponse = function (properties) {
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * ExportLogsServiceResponse partialSuccess.
             * @member {outray.otlp.ExportLogsPartialSuccess.$Properties|null|undefined} partialSuccess
             * @memberof outray.otlp.ExportLogsServiceResponse
             * @instance
             */
            ExportLogsServiceResponse.prototype.partialSuccess = null;

            /**
             * Creates a new ExportLogsServiceResponse instance using the specified properties.
             * @function create
             * @memberof outray.otlp.ExportLogsServiceResponse
             * @static
             * @param {outray.otlp.ExportLogsServiceResponse.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.ExportLogsServiceResponse} ExportLogsServiceResponse instance
             * @type {{
             *   (properties: outray.otlp.ExportLogsServiceResponse.$Shape): outray.otlp.ExportLogsServiceResponse & outray.otlp.ExportLogsServiceResponse.$Shape;
             *   (properties?: outray.otlp.ExportLogsServiceResponse.$Properties): outray.otlp.ExportLogsServiceResponse;
             * }}
             */
            ExportLogsServiceResponse.create = function(properties) {
                return new ExportLogsServiceResponse(properties);
            };

            /**
             * Encodes the specified ExportLogsServiceResponse message. Does not implicitly {@link outray.otlp.ExportLogsServiceResponse.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.ExportLogsServiceResponse
             * @static
             * @param {outray.otlp.ExportLogsServiceResponse.$Properties} message ExportLogsServiceResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ExportLogsServiceResponse.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.partialSuccess != null && $Object.hasOwnProperty.call(message, "partialSuccess"))
                    $root.outray.otlp.ExportLogsPartialSuccess.encode(message.partialSuccess, writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes an ExportLogsServiceResponse message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.ExportLogsServiceResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.ExportLogsServiceResponse & outray.otlp.ExportLogsServiceResponse.$Shape} ExportLogsServiceResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ExportLogsServiceResponse.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.ExportLogsServiceResponse();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            message.partialSuccess = $root.outray.otlp.ExportLogsPartialSuccess.decode(reader, reader.uint32(), $undefined, _depth + 1, message.partialSuccess);
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates an ExportLogsServiceResponse message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.ExportLogsServiceResponse
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.ExportLogsServiceResponse} ExportLogsServiceResponse
             */
            ExportLogsServiceResponse.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.ExportLogsServiceResponse)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.ExportLogsServiceResponse: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.ExportLogsServiceResponse();
                if (object.partialSuccess != null) {
                    if (!$util.isObject(object.partialSuccess))
                        throw $TypeError(".outray.otlp.ExportLogsServiceResponse.partialSuccess: object expected");
                    message.partialSuccess = $root.outray.otlp.ExportLogsPartialSuccess.fromObject(object.partialSuccess, _depth + 1);
                }
                return message;
            };

            /**
             * Creates a plain object from an ExportLogsServiceResponse message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.ExportLogsServiceResponse
             * @static
             * @param {outray.otlp.ExportLogsServiceResponse} message ExportLogsServiceResponse
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ExportLogsServiceResponse.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.defaults)
                    object.partialSuccess = null;
                if (message.partialSuccess != null && $Object.hasOwnProperty.call(message, "partialSuccess"))
                    object.partialSuccess = $root.outray.otlp.ExportLogsPartialSuccess.toObject(message.partialSuccess, options, _depth + 1);
                return object;
            };

            /**
             * Converts this ExportLogsServiceResponse to JSON.
             * @function toJSON
             * @memberof outray.otlp.ExportLogsServiceResponse
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ExportLogsServiceResponse.prototype.toJSON = function() {
                return ExportLogsServiceResponse.toObject(this, $protobuf.util.toJSONOptions);
            };

            return ExportLogsServiceResponse;
        })();

        otlp.ExportLogsPartialSuccess = (function() {

            /**
             * Properties of an ExportLogsPartialSuccess.
             * @typedef {Object} outray.otlp.ExportLogsPartialSuccess.$Properties
             * @property {number|Long|null} [rejectedLogRecords] ExportLogsPartialSuccess rejectedLogRecords
             * @property {string|null} [errorMessage] ExportLogsPartialSuccess errorMessage
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of an ExportLogsPartialSuccess.
             * @memberof outray.otlp
             * @interface IExportLogsPartialSuccess
             * @augments outray.otlp.ExportLogsPartialSuccess.$Properties
             * @deprecated Use outray.otlp.ExportLogsPartialSuccess.$Properties instead.
             */

            /**
             * Shape of an ExportLogsPartialSuccess.
             * @typedef {outray.otlp.ExportLogsPartialSuccess.$Properties} outray.otlp.ExportLogsPartialSuccess.$Shape
             */

            /**
             * Constructs a new ExportLogsPartialSuccess.
             * @memberof outray.otlp
             * @classdesc Represents an ExportLogsPartialSuccess.
             * @constructor
             * @param {outray.otlp.ExportLogsPartialSuccess.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const ExportLogsPartialSuccess = function (properties) {
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * ExportLogsPartialSuccess rejectedLogRecords.
             * @member {number|Long} rejectedLogRecords
             * @memberof outray.otlp.ExportLogsPartialSuccess
             * @instance
             */
            ExportLogsPartialSuccess.prototype.rejectedLogRecords = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

            /**
             * ExportLogsPartialSuccess errorMessage.
             * @member {string} errorMessage
             * @memberof outray.otlp.ExportLogsPartialSuccess
             * @instance
             */
            ExportLogsPartialSuccess.prototype.errorMessage = "";

            /**
             * Creates a new ExportLogsPartialSuccess instance using the specified properties.
             * @function create
             * @memberof outray.otlp.ExportLogsPartialSuccess
             * @static
             * @param {outray.otlp.ExportLogsPartialSuccess.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.ExportLogsPartialSuccess} ExportLogsPartialSuccess instance
             * @type {{
             *   (properties: outray.otlp.ExportLogsPartialSuccess.$Shape): outray.otlp.ExportLogsPartialSuccess & outray.otlp.ExportLogsPartialSuccess.$Shape;
             *   (properties?: outray.otlp.ExportLogsPartialSuccess.$Properties): outray.otlp.ExportLogsPartialSuccess;
             * }}
             */
            ExportLogsPartialSuccess.create = function(properties) {
                return new ExportLogsPartialSuccess(properties);
            };

            /**
             * Encodes the specified ExportLogsPartialSuccess message. Does not implicitly {@link outray.otlp.ExportLogsPartialSuccess.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.ExportLogsPartialSuccess
             * @static
             * @param {outray.otlp.ExportLogsPartialSuccess.$Properties} message ExportLogsPartialSuccess message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ExportLogsPartialSuccess.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.rejectedLogRecords != null && $Object.hasOwnProperty.call(message, "rejectedLogRecords") && (typeof message.rejectedLogRecords === "object" ? message.rejectedLogRecords.low || message.rejectedLogRecords.high : message.rejectedLogRecords !== 0))
                    writer.uint32(/* id 1, wireType 0 =*/8).int64(message.rejectedLogRecords);
                if (message.errorMessage != null && $Object.hasOwnProperty.call(message, "errorMessage") && message.errorMessage !== "")
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.errorMessage);
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes an ExportLogsPartialSuccess message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.ExportLogsPartialSuccess
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.ExportLogsPartialSuccess & outray.otlp.ExportLogsPartialSuccess.$Shape} ExportLogsPartialSuccess
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ExportLogsPartialSuccess.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.ExportLogsPartialSuccess();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 0)
                                break;
                            if (typeof (value = reader.int64()) === "object" ? value.low || value.high : value !== 0)
                                message.rejectedLogRecords = value;
                            else
                                delete message.rejectedLogRecords;
                            continue;
                        }
                    case 2: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.stringVerify()).length)
                                message.errorMessage = value;
                            else
                                delete message.errorMessage;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates an ExportLogsPartialSuccess message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.ExportLogsPartialSuccess
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.ExportLogsPartialSuccess} ExportLogsPartialSuccess
             */
            ExportLogsPartialSuccess.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.ExportLogsPartialSuccess)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.ExportLogsPartialSuccess: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.ExportLogsPartialSuccess();
                if (object.rejectedLogRecords != null)
                    if (typeof object.rejectedLogRecords === "object" ? object.rejectedLogRecords.low || object.rejectedLogRecords.high : $Number(object.rejectedLogRecords) !== 0)
                        if ($util.Long)
                            message.rejectedLogRecords = $util.Long.fromValue(object.rejectedLogRecords, false);
                        else if (typeof object.rejectedLogRecords === "string")
                            message.rejectedLogRecords = $parseInt(object.rejectedLogRecords, 10);
                        else if (typeof object.rejectedLogRecords === "number")
                            message.rejectedLogRecords = object.rejectedLogRecords;
                        else if (typeof object.rejectedLogRecords === "object")
                            message.rejectedLogRecords = new $util.LongBits(object.rejectedLogRecords.low >>> 0, object.rejectedLogRecords.high >>> 0).toNumber();
                if (object.errorMessage != null)
                    if (typeof object.errorMessage !== "string" || object.errorMessage.length)
                        message.errorMessage = $String(object.errorMessage);
                return message;
            };

            /**
             * Creates a plain object from an ExportLogsPartialSuccess message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.ExportLogsPartialSuccess
             * @static
             * @param {outray.otlp.ExportLogsPartialSuccess} message ExportLogsPartialSuccess
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ExportLogsPartialSuccess.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, false);
                        object.rejectedLogRecords = options.longs === $String ? long.toString() : options.longs === $Number ? long.toNumber() : typeof $BigInt !== "undefined" && options.longs === $BigInt ? long.toBigInt() : long;
                    } else
                        object.rejectedLogRecords = options.longs === $String ? "0" : typeof $BigInt !== "undefined" && options.longs === $BigInt ? $BigInt("0") : 0;
                    object.errorMessage = "";
                }
                if (message.rejectedLogRecords != null && $Object.hasOwnProperty.call(message, "rejectedLogRecords"))
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.rejectedLogRecords = typeof message.rejectedLogRecords === "number" ? $BigInt(message.rejectedLogRecords) : $util.Long.fromBits(message.rejectedLogRecords.low >>> 0, message.rejectedLogRecords.high >>> 0, false).toBigInt();
                    else if (typeof message.rejectedLogRecords === "number")
                        object.rejectedLogRecords = options.longs === $String ? $String(message.rejectedLogRecords) : message.rejectedLogRecords;
                    else
                        object.rejectedLogRecords = options.longs === $String ? $util.Long.prototype.toString.call(message.rejectedLogRecords) : options.longs === $Number ? new $util.LongBits(message.rejectedLogRecords.low >>> 0, message.rejectedLogRecords.high >>> 0).toNumber() : message.rejectedLogRecords;
                if (message.errorMessage != null && $Object.hasOwnProperty.call(message, "errorMessage"))
                    object.errorMessage = message.errorMessage;
                return object;
            };

            /**
             * Converts this ExportLogsPartialSuccess to JSON.
             * @function toJSON
             * @memberof outray.otlp.ExportLogsPartialSuccess
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ExportLogsPartialSuccess.prototype.toJSON = function() {
                return ExportLogsPartialSuccess.toObject(this, $protobuf.util.toJSONOptions);
            };

            return ExportLogsPartialSuccess;
        })();

        otlp.ResourceMetrics = (function() {

            /**
             * Properties of a ResourceMetrics.
             * @typedef {Object} outray.otlp.ResourceMetrics.$Properties
             * @property {outray.otlp.Resource.$Properties|null} [resource] ResourceMetrics resource
             * @property {Array.<outray.otlp.ScopeMetrics.$Properties>|null} [scopeMetrics] ResourceMetrics scopeMetrics
             * @property {string|null} [schemaUrl] ResourceMetrics schemaUrl
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of a ResourceMetrics.
             * @memberof outray.otlp
             * @interface IResourceMetrics
             * @augments outray.otlp.ResourceMetrics.$Properties
             * @deprecated Use outray.otlp.ResourceMetrics.$Properties instead.
             */

            /**
             * Shape of a ResourceMetrics.
             * @typedef {{
             *   resource?: outray.otlp.Resource.$Shape|null;
             *   scopeMetrics?: Array.<outray.otlp.ScopeMetrics.$Shape>|null;
             *   schemaUrl?: string|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.ResourceMetrics.$Shape
             */

            /**
             * Constructs a new ResourceMetrics.
             * @memberof outray.otlp
             * @classdesc Represents a ResourceMetrics.
             * @constructor
             * @param {outray.otlp.ResourceMetrics.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const ResourceMetrics = function (properties) {
                this.scopeMetrics = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * ResourceMetrics resource.
             * @member {outray.otlp.Resource.$Properties|null|undefined} resource
             * @memberof outray.otlp.ResourceMetrics
             * @instance
             */
            ResourceMetrics.prototype.resource = null;

            /**
             * ResourceMetrics scopeMetrics.
             * @member {Array.<outray.otlp.ScopeMetrics.$Properties>} scopeMetrics
             * @memberof outray.otlp.ResourceMetrics
             * @instance
             */
            ResourceMetrics.prototype.scopeMetrics = $util.emptyArray;

            /**
             * ResourceMetrics schemaUrl.
             * @member {string} schemaUrl
             * @memberof outray.otlp.ResourceMetrics
             * @instance
             */
            ResourceMetrics.prototype.schemaUrl = "";

            /**
             * Creates a new ResourceMetrics instance using the specified properties.
             * @function create
             * @memberof outray.otlp.ResourceMetrics
             * @static
             * @param {outray.otlp.ResourceMetrics.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.ResourceMetrics} ResourceMetrics instance
             * @type {{
             *   (properties: outray.otlp.ResourceMetrics.$Shape): outray.otlp.ResourceMetrics & outray.otlp.ResourceMetrics.$Shape;
             *   (properties?: outray.otlp.ResourceMetrics.$Properties): outray.otlp.ResourceMetrics;
             * }}
             */
            ResourceMetrics.create = function(properties) {
                return new ResourceMetrics(properties);
            };

            /**
             * Encodes the specified ResourceMetrics message. Does not implicitly {@link outray.otlp.ResourceMetrics.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.ResourceMetrics
             * @static
             * @param {outray.otlp.ResourceMetrics.$Properties} message ResourceMetrics message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ResourceMetrics.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.resource != null && $Object.hasOwnProperty.call(message, "resource"))
                    $root.outray.otlp.Resource.encode(message.resource, writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
                if (message.scopeMetrics != null && message.scopeMetrics.length)
                    for (let i = 0; i < message.scopeMetrics.length; ++i)
                        $root.outray.otlp.ScopeMetrics.encode(message.scopeMetrics[i], writer.uint32(/* id 2, wireType 2 =*/18).fork(), _depth + 1).ldelim();
                if (message.schemaUrl != null && $Object.hasOwnProperty.call(message, "schemaUrl") && message.schemaUrl !== "")
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.schemaUrl);
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes a ResourceMetrics message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.ResourceMetrics
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.ResourceMetrics & outray.otlp.ResourceMetrics.$Shape} ResourceMetrics
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ResourceMetrics.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.ResourceMetrics();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            message.resource = $root.outray.otlp.Resource.decode(reader, reader.uint32(), $undefined, _depth + 1, message.resource);
                            continue;
                        }
                    case 2: {
                            if (wireType !== 2)
                                break;
                            if (!(message.scopeMetrics && message.scopeMetrics.length))
                                message.scopeMetrics = [];
                            message.scopeMetrics.push($root.outray.otlp.ScopeMetrics.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 3: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.stringVerify()).length)
                                message.schemaUrl = value;
                            else
                                delete message.schemaUrl;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates a ResourceMetrics message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.ResourceMetrics
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.ResourceMetrics} ResourceMetrics
             */
            ResourceMetrics.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.ResourceMetrics)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.ResourceMetrics: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.ResourceMetrics();
                if (object.resource != null) {
                    if (!$util.isObject(object.resource))
                        throw $TypeError(".outray.otlp.ResourceMetrics.resource: object expected");
                    message.resource = $root.outray.otlp.Resource.fromObject(object.resource, _depth + 1);
                }
                if (object.scopeMetrics) {
                    if (!$Array.isArray(object.scopeMetrics))
                        throw $TypeError(".outray.otlp.ResourceMetrics.scopeMetrics: array expected");
                    message.scopeMetrics = $Array(object.scopeMetrics.length);
                    for (let i = 0; i < object.scopeMetrics.length; ++i) {
                        if (!$util.isObject(object.scopeMetrics[i]))
                            throw $TypeError(".outray.otlp.ResourceMetrics.scopeMetrics: object expected");
                        message.scopeMetrics[i] = $root.outray.otlp.ScopeMetrics.fromObject(object.scopeMetrics[i], _depth + 1);
                    }
                }
                if (object.schemaUrl != null)
                    if (typeof object.schemaUrl !== "string" || object.schemaUrl.length)
                        message.schemaUrl = $String(object.schemaUrl);
                return message;
            };

            /**
             * Creates a plain object from a ResourceMetrics message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.ResourceMetrics
             * @static
             * @param {outray.otlp.ResourceMetrics} message ResourceMetrics
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ResourceMetrics.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.scopeMetrics = [];
                if (options.defaults) {
                    object.resource = null;
                    object.schemaUrl = "";
                }
                if (message.resource != null && $Object.hasOwnProperty.call(message, "resource"))
                    object.resource = $root.outray.otlp.Resource.toObject(message.resource, options, _depth + 1);
                if (message.scopeMetrics && message.scopeMetrics.length) {
                    object.scopeMetrics = $Array(message.scopeMetrics.length);
                    for (let j = 0; j < message.scopeMetrics.length; ++j)
                        object.scopeMetrics[j] = $root.outray.otlp.ScopeMetrics.toObject(message.scopeMetrics[j], options, _depth + 1);
                }
                if (message.schemaUrl != null && $Object.hasOwnProperty.call(message, "schemaUrl"))
                    object.schemaUrl = message.schemaUrl;
                return object;
            };

            /**
             * Converts this ResourceMetrics to JSON.
             * @function toJSON
             * @memberof outray.otlp.ResourceMetrics
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ResourceMetrics.prototype.toJSON = function() {
                return ResourceMetrics.toObject(this, $protobuf.util.toJSONOptions);
            };

            return ResourceMetrics;
        })();

        otlp.ScopeMetrics = (function() {

            /**
             * Properties of a ScopeMetrics.
             * @typedef {Object} outray.otlp.ScopeMetrics.$Properties
             * @property {outray.otlp.InstrumentationScope.$Properties|null} [scope] ScopeMetrics scope
             * @property {Array.<outray.otlp.Metric.$Properties>|null} [metrics] ScopeMetrics metrics
             * @property {string|null} [schemaUrl] ScopeMetrics schemaUrl
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of a ScopeMetrics.
             * @memberof outray.otlp
             * @interface IScopeMetrics
             * @augments outray.otlp.ScopeMetrics.$Properties
             * @deprecated Use outray.otlp.ScopeMetrics.$Properties instead.
             */

            /**
             * Shape of a ScopeMetrics.
             * @typedef {{
             *   scope?: outray.otlp.InstrumentationScope.$Shape|null;
             *   metrics?: Array.<outray.otlp.Metric.$Shape>|null;
             *   schemaUrl?: string|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.ScopeMetrics.$Shape
             */

            /**
             * Constructs a new ScopeMetrics.
             * @memberof outray.otlp
             * @classdesc Represents a ScopeMetrics.
             * @constructor
             * @param {outray.otlp.ScopeMetrics.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const ScopeMetrics = function (properties) {
                this.metrics = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * ScopeMetrics scope.
             * @member {outray.otlp.InstrumentationScope.$Properties|null|undefined} scope
             * @memberof outray.otlp.ScopeMetrics
             * @instance
             */
            ScopeMetrics.prototype.scope = null;

            /**
             * ScopeMetrics metrics.
             * @member {Array.<outray.otlp.Metric.$Properties>} metrics
             * @memberof outray.otlp.ScopeMetrics
             * @instance
             */
            ScopeMetrics.prototype.metrics = $util.emptyArray;

            /**
             * ScopeMetrics schemaUrl.
             * @member {string} schemaUrl
             * @memberof outray.otlp.ScopeMetrics
             * @instance
             */
            ScopeMetrics.prototype.schemaUrl = "";

            /**
             * Creates a new ScopeMetrics instance using the specified properties.
             * @function create
             * @memberof outray.otlp.ScopeMetrics
             * @static
             * @param {outray.otlp.ScopeMetrics.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.ScopeMetrics} ScopeMetrics instance
             * @type {{
             *   (properties: outray.otlp.ScopeMetrics.$Shape): outray.otlp.ScopeMetrics & outray.otlp.ScopeMetrics.$Shape;
             *   (properties?: outray.otlp.ScopeMetrics.$Properties): outray.otlp.ScopeMetrics;
             * }}
             */
            ScopeMetrics.create = function(properties) {
                return new ScopeMetrics(properties);
            };

            /**
             * Encodes the specified ScopeMetrics message. Does not implicitly {@link outray.otlp.ScopeMetrics.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.ScopeMetrics
             * @static
             * @param {outray.otlp.ScopeMetrics.$Properties} message ScopeMetrics message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ScopeMetrics.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.scope != null && $Object.hasOwnProperty.call(message, "scope"))
                    $root.outray.otlp.InstrumentationScope.encode(message.scope, writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
                if (message.metrics != null && message.metrics.length)
                    for (let i = 0; i < message.metrics.length; ++i)
                        $root.outray.otlp.Metric.encode(message.metrics[i], writer.uint32(/* id 2, wireType 2 =*/18).fork(), _depth + 1).ldelim();
                if (message.schemaUrl != null && $Object.hasOwnProperty.call(message, "schemaUrl") && message.schemaUrl !== "")
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.schemaUrl);
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes a ScopeMetrics message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.ScopeMetrics
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.ScopeMetrics & outray.otlp.ScopeMetrics.$Shape} ScopeMetrics
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ScopeMetrics.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.ScopeMetrics();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            message.scope = $root.outray.otlp.InstrumentationScope.decode(reader, reader.uint32(), $undefined, _depth + 1, message.scope);
                            continue;
                        }
                    case 2: {
                            if (wireType !== 2)
                                break;
                            if (!(message.metrics && message.metrics.length))
                                message.metrics = [];
                            message.metrics.push($root.outray.otlp.Metric.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 3: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.stringVerify()).length)
                                message.schemaUrl = value;
                            else
                                delete message.schemaUrl;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates a ScopeMetrics message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.ScopeMetrics
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.ScopeMetrics} ScopeMetrics
             */
            ScopeMetrics.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.ScopeMetrics)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.ScopeMetrics: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.ScopeMetrics();
                if (object.scope != null) {
                    if (!$util.isObject(object.scope))
                        throw $TypeError(".outray.otlp.ScopeMetrics.scope: object expected");
                    message.scope = $root.outray.otlp.InstrumentationScope.fromObject(object.scope, _depth + 1);
                }
                if (object.metrics) {
                    if (!$Array.isArray(object.metrics))
                        throw $TypeError(".outray.otlp.ScopeMetrics.metrics: array expected");
                    message.metrics = $Array(object.metrics.length);
                    for (let i = 0; i < object.metrics.length; ++i) {
                        if (!$util.isObject(object.metrics[i]))
                            throw $TypeError(".outray.otlp.ScopeMetrics.metrics: object expected");
                        message.metrics[i] = $root.outray.otlp.Metric.fromObject(object.metrics[i], _depth + 1);
                    }
                }
                if (object.schemaUrl != null)
                    if (typeof object.schemaUrl !== "string" || object.schemaUrl.length)
                        message.schemaUrl = $String(object.schemaUrl);
                return message;
            };

            /**
             * Creates a plain object from a ScopeMetrics message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.ScopeMetrics
             * @static
             * @param {outray.otlp.ScopeMetrics} message ScopeMetrics
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ScopeMetrics.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.metrics = [];
                if (options.defaults) {
                    object.scope = null;
                    object.schemaUrl = "";
                }
                if (message.scope != null && $Object.hasOwnProperty.call(message, "scope"))
                    object.scope = $root.outray.otlp.InstrumentationScope.toObject(message.scope, options, _depth + 1);
                if (message.metrics && message.metrics.length) {
                    object.metrics = $Array(message.metrics.length);
                    for (let j = 0; j < message.metrics.length; ++j)
                        object.metrics[j] = $root.outray.otlp.Metric.toObject(message.metrics[j], options, _depth + 1);
                }
                if (message.schemaUrl != null && $Object.hasOwnProperty.call(message, "schemaUrl"))
                    object.schemaUrl = message.schemaUrl;
                return object;
            };

            /**
             * Converts this ScopeMetrics to JSON.
             * @function toJSON
             * @memberof outray.otlp.ScopeMetrics
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ScopeMetrics.prototype.toJSON = function() {
                return ScopeMetrics.toObject(this, $protobuf.util.toJSONOptions);
            };

            return ScopeMetrics;
        })();

        otlp.Metric = (function() {

            /**
             * Properties of a Metric.
             * @typedef {Object} outray.otlp.Metric.$Properties
             * @property {string|null} [name] Metric name
             * @property {string|null} [description] Metric description
             * @property {string|null} [unit] Metric unit
             * @property {outray.otlp.Gauge.$Properties|null} [gauge] Metric gauge
             * @property {outray.otlp.Sum.$Properties|null} [sum] Metric sum
             * @property {outray.otlp.Histogram.$Properties|null} [histogram] Metric histogram
             * @property {outray.otlp.ExponentialHistogram.$Properties|null} [exponentialHistogram] Metric exponentialHistogram
             * @property {outray.otlp.Summary.$Properties|null} [summary] Metric summary
             * @property {Array.<outray.otlp.KeyValue.$Properties>|null} [metadata] Metric metadata
             * @property {"gauge"|"sum"|"histogram"|"exponentialHistogram"|"summary"} [data] Metric data
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of a Metric.
             * @memberof outray.otlp
             * @interface IMetric
             * @augments outray.otlp.Metric.$Properties
             * @deprecated Use outray.otlp.Metric.$Properties instead.
             */

            /**
             * Narrowed shape of a Metric.
             * @typedef {{
             *   name?: string|null;
             *   description?: string|null;
             *   unit?: string|null;
             *   gauge?: outray.otlp.Gauge.$Shape|null;
             *   sum?: outray.otlp.Sum.$Shape|null;
             *   histogram?: outray.otlp.Histogram.$Shape|null;
             *   exponentialHistogram?: outray.otlp.ExponentialHistogram.$Shape|null;
             *   summary?: outray.otlp.Summary.$Shape|null;
             *   metadata?: Array.<outray.otlp.KeyValue.$Shape>|null;
             *   $unknowns?: Array.<Uint8Array>;
             * } & (
             *   ({ data?: undefined; gauge?: null; sum?: null; histogram?: null; exponentialHistogram?: null; summary?: null }|{ data?: "gauge"; gauge: outray.otlp.Gauge.$Shape; sum?: null; histogram?: null; exponentialHistogram?: null; summary?: null }|{ data?: "sum"; gauge?: null; sum: outray.otlp.Sum.$Shape; histogram?: null; exponentialHistogram?: null; summary?: null }|{ data?: "histogram"; gauge?: null; sum?: null; histogram: outray.otlp.Histogram.$Shape; exponentialHistogram?: null; summary?: null }|{ data?: "exponentialHistogram"; gauge?: null; sum?: null; histogram?: null; exponentialHistogram: outray.otlp.ExponentialHistogram.$Shape; summary?: null }|{ data?: "summary"; gauge?: null; sum?: null; histogram?: null; exponentialHistogram?: null; summary: outray.otlp.Summary.$Shape })
             * )} outray.otlp.Metric.$Shape
             */

            /**
             * Constructs a new Metric.
             * @memberof outray.otlp
             * @classdesc Represents a Metric.
             * @constructor
             * @param {outray.otlp.Metric.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const Metric = function (properties) {
                this.metadata = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * Metric name.
             * @member {string} name
             * @memberof outray.otlp.Metric
             * @instance
             */
            Metric.prototype.name = "";

            /**
             * Metric description.
             * @member {string} description
             * @memberof outray.otlp.Metric
             * @instance
             */
            Metric.prototype.description = "";

            /**
             * Metric unit.
             * @member {string} unit
             * @memberof outray.otlp.Metric
             * @instance
             */
            Metric.prototype.unit = "";

            /**
             * Metric gauge.
             * @member {outray.otlp.Gauge.$Properties|null|undefined} gauge
             * @memberof outray.otlp.Metric
             * @instance
             */
            Metric.prototype.gauge = null;

            /**
             * Metric sum.
             * @member {outray.otlp.Sum.$Properties|null|undefined} sum
             * @memberof outray.otlp.Metric
             * @instance
             */
            Metric.prototype.sum = null;

            /**
             * Metric histogram.
             * @member {outray.otlp.Histogram.$Properties|null|undefined} histogram
             * @memberof outray.otlp.Metric
             * @instance
             */
            Metric.prototype.histogram = null;

            /**
             * Metric exponentialHistogram.
             * @member {outray.otlp.ExponentialHistogram.$Properties|null|undefined} exponentialHistogram
             * @memberof outray.otlp.Metric
             * @instance
             */
            Metric.prototype.exponentialHistogram = null;

            /**
             * Metric summary.
             * @member {outray.otlp.Summary.$Properties|null|undefined} summary
             * @memberof outray.otlp.Metric
             * @instance
             */
            Metric.prototype.summary = null;

            /**
             * Metric metadata.
             * @member {Array.<outray.otlp.KeyValue.$Properties>} metadata
             * @memberof outray.otlp.Metric
             * @instance
             */
            Metric.prototype.metadata = $util.emptyArray;

            // OneOf field names bound to virtual getters and setters
            let $oneOfFields;

            /**
             * Metric data.
             * @member {"gauge"|"sum"|"histogram"|"exponentialHistogram"|"summary"|undefined} data
             * @memberof outray.otlp.Metric
             * @instance
             */
            $Object.defineProperty(Metric.prototype, "data", {
                get: $util.oneOfGetter($oneOfFields = ["gauge", "sum", "histogram", "exponentialHistogram", "summary"]),
                set: $util.oneOfSetter($oneOfFields)
            });

            /**
             * Creates a new Metric instance using the specified properties.
             * @function create
             * @memberof outray.otlp.Metric
             * @static
             * @param {outray.otlp.Metric.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.Metric} Metric instance
             * @type {{
             *   (properties: outray.otlp.Metric.$Shape): outray.otlp.Metric & outray.otlp.Metric.$Shape;
             *   (properties?: outray.otlp.Metric.$Properties): outray.otlp.Metric;
             * }}
             */
            Metric.create = function(properties) {
                return new Metric(properties);
            };

            /**
             * Encodes the specified Metric message. Does not implicitly {@link outray.otlp.Metric.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.Metric
             * @static
             * @param {outray.otlp.Metric.$Properties} message Metric message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Metric.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.name != null && $Object.hasOwnProperty.call(message, "name") && message.name !== "")
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.name);
                if (message.description != null && $Object.hasOwnProperty.call(message, "description") && message.description !== "")
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.description);
                if (message.unit != null && $Object.hasOwnProperty.call(message, "unit") && message.unit !== "")
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.unit);
                if (message.gauge != null && $Object.hasOwnProperty.call(message, "gauge"))
                    $root.outray.otlp.Gauge.encode(message.gauge, writer.uint32(/* id 5, wireType 2 =*/42).fork(), _depth + 1).ldelim();
                if (message.sum != null && $Object.hasOwnProperty.call(message, "sum"))
                    $root.outray.otlp.Sum.encode(message.sum, writer.uint32(/* id 7, wireType 2 =*/58).fork(), _depth + 1).ldelim();
                if (message.histogram != null && $Object.hasOwnProperty.call(message, "histogram"))
                    $root.outray.otlp.Histogram.encode(message.histogram, writer.uint32(/* id 9, wireType 2 =*/74).fork(), _depth + 1).ldelim();
                if (message.exponentialHistogram != null && $Object.hasOwnProperty.call(message, "exponentialHistogram"))
                    $root.outray.otlp.ExponentialHistogram.encode(message.exponentialHistogram, writer.uint32(/* id 10, wireType 2 =*/82).fork(), _depth + 1).ldelim();
                if (message.summary != null && $Object.hasOwnProperty.call(message, "summary"))
                    $root.outray.otlp.Summary.encode(message.summary, writer.uint32(/* id 11, wireType 2 =*/90).fork(), _depth + 1).ldelim();
                if (message.metadata != null && message.metadata.length)
                    for (let i = 0; i < message.metadata.length; ++i)
                        $root.outray.otlp.KeyValue.encode(message.metadata[i], writer.uint32(/* id 12, wireType 2 =*/98).fork(), _depth + 1).ldelim();
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes a Metric message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.Metric
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.Metric & outray.otlp.Metric.$Shape} Metric
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Metric.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.Metric();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.stringVerify()).length)
                                message.name = value;
                            else
                                delete message.name;
                            continue;
                        }
                    case 2: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.stringVerify()).length)
                                message.description = value;
                            else
                                delete message.description;
                            continue;
                        }
                    case 3: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.stringVerify()).length)
                                message.unit = value;
                            else
                                delete message.unit;
                            continue;
                        }
                    case 5: {
                            if (wireType !== 2)
                                break;
                            message.gauge = $root.outray.otlp.Gauge.decode(reader, reader.uint32(), $undefined, _depth + 1, message.gauge);
                            message.data = "gauge";
                            continue;
                        }
                    case 7: {
                            if (wireType !== 2)
                                break;
                            message.sum = $root.outray.otlp.Sum.decode(reader, reader.uint32(), $undefined, _depth + 1, message.sum);
                            message.data = "sum";
                            continue;
                        }
                    case 9: {
                            if (wireType !== 2)
                                break;
                            message.histogram = $root.outray.otlp.Histogram.decode(reader, reader.uint32(), $undefined, _depth + 1, message.histogram);
                            message.data = "histogram";
                            continue;
                        }
                    case 10: {
                            if (wireType !== 2)
                                break;
                            message.exponentialHistogram = $root.outray.otlp.ExponentialHistogram.decode(reader, reader.uint32(), $undefined, _depth + 1, message.exponentialHistogram);
                            message.data = "exponentialHistogram";
                            continue;
                        }
                    case 11: {
                            if (wireType !== 2)
                                break;
                            message.summary = $root.outray.otlp.Summary.decode(reader, reader.uint32(), $undefined, _depth + 1, message.summary);
                            message.data = "summary";
                            continue;
                        }
                    case 12: {
                            if (wireType !== 2)
                                break;
                            if (!(message.metadata && message.metadata.length))
                                message.metadata = [];
                            message.metadata.push($root.outray.otlp.KeyValue.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates a Metric message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.Metric
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.Metric} Metric
             */
            Metric.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.Metric)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.Metric: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.Metric();
                if (object.name != null)
                    if (typeof object.name !== "string" || object.name.length)
                        message.name = $String(object.name);
                if (object.description != null)
                    if (typeof object.description !== "string" || object.description.length)
                        message.description = $String(object.description);
                if (object.unit != null)
                    if (typeof object.unit !== "string" || object.unit.length)
                        message.unit = $String(object.unit);
                if (object.gauge != null) {
                    if (!$util.isObject(object.gauge))
                        throw $TypeError(".outray.otlp.Metric.gauge: object expected");
                    message.gauge = $root.outray.otlp.Gauge.fromObject(object.gauge, _depth + 1);
                }
                if (object.sum != null) {
                    if (!$util.isObject(object.sum))
                        throw $TypeError(".outray.otlp.Metric.sum: object expected");
                    message.sum = $root.outray.otlp.Sum.fromObject(object.sum, _depth + 1);
                }
                if (object.histogram != null) {
                    if (!$util.isObject(object.histogram))
                        throw $TypeError(".outray.otlp.Metric.histogram: object expected");
                    message.histogram = $root.outray.otlp.Histogram.fromObject(object.histogram, _depth + 1);
                }
                if (object.exponentialHistogram != null) {
                    if (!$util.isObject(object.exponentialHistogram))
                        throw $TypeError(".outray.otlp.Metric.exponentialHistogram: object expected");
                    message.exponentialHistogram = $root.outray.otlp.ExponentialHistogram.fromObject(object.exponentialHistogram, _depth + 1);
                }
                if (object.summary != null) {
                    if (!$util.isObject(object.summary))
                        throw $TypeError(".outray.otlp.Metric.summary: object expected");
                    message.summary = $root.outray.otlp.Summary.fromObject(object.summary, _depth + 1);
                }
                if (object.metadata) {
                    if (!$Array.isArray(object.metadata))
                        throw $TypeError(".outray.otlp.Metric.metadata: array expected");
                    message.metadata = $Array(object.metadata.length);
                    for (let i = 0; i < object.metadata.length; ++i) {
                        if (!$util.isObject(object.metadata[i]))
                            throw $TypeError(".outray.otlp.Metric.metadata: object expected");
                        message.metadata[i] = $root.outray.otlp.KeyValue.fromObject(object.metadata[i], _depth + 1);
                    }
                }
                return message;
            };

            /**
             * Creates a plain object from a Metric message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.Metric
             * @static
             * @param {outray.otlp.Metric} message Metric
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            Metric.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.metadata = [];
                if (options.defaults) {
                    object.name = "";
                    object.description = "";
                    object.unit = "";
                }
                if (message.name != null && $Object.hasOwnProperty.call(message, "name"))
                    object.name = message.name;
                if (message.description != null && $Object.hasOwnProperty.call(message, "description"))
                    object.description = message.description;
                if (message.unit != null && $Object.hasOwnProperty.call(message, "unit"))
                    object.unit = message.unit;
                if (message.gauge != null && $Object.hasOwnProperty.call(message, "gauge")) {
                    object.gauge = $root.outray.otlp.Gauge.toObject(message.gauge, options, _depth + 1);
                    if (options.oneofs)
                        object.data = "gauge";
                }
                if (message.sum != null && $Object.hasOwnProperty.call(message, "sum")) {
                    object.sum = $root.outray.otlp.Sum.toObject(message.sum, options, _depth + 1);
                    if (options.oneofs)
                        object.data = "sum";
                }
                if (message.histogram != null && $Object.hasOwnProperty.call(message, "histogram")) {
                    object.histogram = $root.outray.otlp.Histogram.toObject(message.histogram, options, _depth + 1);
                    if (options.oneofs)
                        object.data = "histogram";
                }
                if (message.exponentialHistogram != null && $Object.hasOwnProperty.call(message, "exponentialHistogram")) {
                    object.exponentialHistogram = $root.outray.otlp.ExponentialHistogram.toObject(message.exponentialHistogram, options, _depth + 1);
                    if (options.oneofs)
                        object.data = "exponentialHistogram";
                }
                if (message.summary != null && $Object.hasOwnProperty.call(message, "summary")) {
                    object.summary = $root.outray.otlp.Summary.toObject(message.summary, options, _depth + 1);
                    if (options.oneofs)
                        object.data = "summary";
                }
                if (message.metadata && message.metadata.length) {
                    object.metadata = $Array(message.metadata.length);
                    for (let j = 0; j < message.metadata.length; ++j)
                        object.metadata[j] = $root.outray.otlp.KeyValue.toObject(message.metadata[j], options, _depth + 1);
                }
                return object;
            };

            /**
             * Converts this Metric to JSON.
             * @function toJSON
             * @memberof outray.otlp.Metric
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            Metric.prototype.toJSON = function() {
                return Metric.toObject(this, $protobuf.util.toJSONOptions);
            };

            return Metric;
        })();

        otlp.Gauge = (function() {

            /**
             * Properties of a Gauge.
             * @typedef {Object} outray.otlp.Gauge.$Properties
             * @property {Array.<outray.otlp.NumberDataPoint.$Properties>|null} [dataPoints] Gauge dataPoints
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of a Gauge.
             * @memberof outray.otlp
             * @interface IGauge
             * @augments outray.otlp.Gauge.$Properties
             * @deprecated Use outray.otlp.Gauge.$Properties instead.
             */

            /**
             * Shape of a Gauge.
             * @typedef {{
             *   dataPoints?: Array.<outray.otlp.NumberDataPoint.$Shape>|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.Gauge.$Shape
             */

            /**
             * Constructs a new Gauge.
             * @memberof outray.otlp
             * @classdesc Represents a Gauge.
             * @constructor
             * @param {outray.otlp.Gauge.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const Gauge = function (properties) {
                this.dataPoints = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * Gauge dataPoints.
             * @member {Array.<outray.otlp.NumberDataPoint.$Properties>} dataPoints
             * @memberof outray.otlp.Gauge
             * @instance
             */
            Gauge.prototype.dataPoints = $util.emptyArray;

            /**
             * Creates a new Gauge instance using the specified properties.
             * @function create
             * @memberof outray.otlp.Gauge
             * @static
             * @param {outray.otlp.Gauge.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.Gauge} Gauge instance
             * @type {{
             *   (properties: outray.otlp.Gauge.$Shape): outray.otlp.Gauge & outray.otlp.Gauge.$Shape;
             *   (properties?: outray.otlp.Gauge.$Properties): outray.otlp.Gauge;
             * }}
             */
            Gauge.create = function(properties) {
                return new Gauge(properties);
            };

            /**
             * Encodes the specified Gauge message. Does not implicitly {@link outray.otlp.Gauge.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.Gauge
             * @static
             * @param {outray.otlp.Gauge.$Properties} message Gauge message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Gauge.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.dataPoints != null && message.dataPoints.length)
                    for (let i = 0; i < message.dataPoints.length; ++i)
                        $root.outray.otlp.NumberDataPoint.encode(message.dataPoints[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes a Gauge message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.Gauge
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.Gauge & outray.otlp.Gauge.$Shape} Gauge
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Gauge.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.Gauge();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            if (!(message.dataPoints && message.dataPoints.length))
                                message.dataPoints = [];
                            message.dataPoints.push($root.outray.otlp.NumberDataPoint.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates a Gauge message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.Gauge
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.Gauge} Gauge
             */
            Gauge.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.Gauge)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.Gauge: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.Gauge();
                if (object.dataPoints) {
                    if (!$Array.isArray(object.dataPoints))
                        throw $TypeError(".outray.otlp.Gauge.dataPoints: array expected");
                    message.dataPoints = $Array(object.dataPoints.length);
                    for (let i = 0; i < object.dataPoints.length; ++i) {
                        if (!$util.isObject(object.dataPoints[i]))
                            throw $TypeError(".outray.otlp.Gauge.dataPoints: object expected");
                        message.dataPoints[i] = $root.outray.otlp.NumberDataPoint.fromObject(object.dataPoints[i], _depth + 1);
                    }
                }
                return message;
            };

            /**
             * Creates a plain object from a Gauge message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.Gauge
             * @static
             * @param {outray.otlp.Gauge} message Gauge
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            Gauge.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.dataPoints = [];
                if (message.dataPoints && message.dataPoints.length) {
                    object.dataPoints = $Array(message.dataPoints.length);
                    for (let j = 0; j < message.dataPoints.length; ++j)
                        object.dataPoints[j] = $root.outray.otlp.NumberDataPoint.toObject(message.dataPoints[j], options, _depth + 1);
                }
                return object;
            };

            /**
             * Converts this Gauge to JSON.
             * @function toJSON
             * @memberof outray.otlp.Gauge
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            Gauge.prototype.toJSON = function() {
                return Gauge.toObject(this, $protobuf.util.toJSONOptions);
            };

            return Gauge;
        })();

        otlp.Sum = (function() {

            /**
             * Properties of a Sum.
             * @typedef {Object} outray.otlp.Sum.$Properties
             * @property {Array.<outray.otlp.NumberDataPoint.$Properties>|null} [dataPoints] Sum dataPoints
             * @property {outray.otlp.AggregationTemporality|null} [aggregationTemporality] Sum aggregationTemporality
             * @property {boolean|null} [isMonotonic] Sum isMonotonic
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of a Sum.
             * @memberof outray.otlp
             * @interface ISum
             * @augments outray.otlp.Sum.$Properties
             * @deprecated Use outray.otlp.Sum.$Properties instead.
             */

            /**
             * Shape of a Sum.
             * @typedef {{
             *   dataPoints?: Array.<outray.otlp.NumberDataPoint.$Shape>|null;
             *   aggregationTemporality?: outray.otlp.AggregationTemporality|null;
             *   isMonotonic?: boolean|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.Sum.$Shape
             */

            /**
             * Constructs a new Sum.
             * @memberof outray.otlp
             * @classdesc Represents a Sum.
             * @constructor
             * @param {outray.otlp.Sum.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const Sum = function (properties) {
                this.dataPoints = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * Sum dataPoints.
             * @member {Array.<outray.otlp.NumberDataPoint.$Properties>} dataPoints
             * @memberof outray.otlp.Sum
             * @instance
             */
            Sum.prototype.dataPoints = $util.emptyArray;

            /**
             * Sum aggregationTemporality.
             * @member {outray.otlp.AggregationTemporality} aggregationTemporality
             * @memberof outray.otlp.Sum
             * @instance
             */
            Sum.prototype.aggregationTemporality = 0;

            /**
             * Sum isMonotonic.
             * @member {boolean} isMonotonic
             * @memberof outray.otlp.Sum
             * @instance
             */
            Sum.prototype.isMonotonic = false;

            /**
             * Creates a new Sum instance using the specified properties.
             * @function create
             * @memberof outray.otlp.Sum
             * @static
             * @param {outray.otlp.Sum.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.Sum} Sum instance
             * @type {{
             *   (properties: outray.otlp.Sum.$Shape): outray.otlp.Sum & outray.otlp.Sum.$Shape;
             *   (properties?: outray.otlp.Sum.$Properties): outray.otlp.Sum;
             * }}
             */
            Sum.create = function(properties) {
                return new Sum(properties);
            };

            /**
             * Encodes the specified Sum message. Does not implicitly {@link outray.otlp.Sum.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.Sum
             * @static
             * @param {outray.otlp.Sum.$Properties} message Sum message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Sum.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.dataPoints != null && message.dataPoints.length)
                    for (let i = 0; i < message.dataPoints.length; ++i)
                        $root.outray.otlp.NumberDataPoint.encode(message.dataPoints[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
                if (message.aggregationTemporality != null && $Object.hasOwnProperty.call(message, "aggregationTemporality") && message.aggregationTemporality !== 0)
                    writer.uint32(/* id 2, wireType 0 =*/16).int32(message.aggregationTemporality);
                if (message.isMonotonic != null && $Object.hasOwnProperty.call(message, "isMonotonic") && message.isMonotonic !== false)
                    writer.uint32(/* id 3, wireType 0 =*/24).bool(message.isMonotonic);
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes a Sum message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.Sum
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.Sum & outray.otlp.Sum.$Shape} Sum
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Sum.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.Sum();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            if (!(message.dataPoints && message.dataPoints.length))
                                message.dataPoints = [];
                            message.dataPoints.push($root.outray.otlp.NumberDataPoint.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 2: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.int32())
                                message.aggregationTemporality = value;
                            else
                                delete message.aggregationTemporality;
                            continue;
                        }
                    case 3: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.bool())
                                message.isMonotonic = value;
                            else
                                delete message.isMonotonic;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates a Sum message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.Sum
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.Sum} Sum
             */
            Sum.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.Sum)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.Sum: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.Sum();
                if (object.dataPoints) {
                    if (!$Array.isArray(object.dataPoints))
                        throw $TypeError(".outray.otlp.Sum.dataPoints: array expected");
                    message.dataPoints = $Array(object.dataPoints.length);
                    for (let i = 0; i < object.dataPoints.length; ++i) {
                        if (!$util.isObject(object.dataPoints[i]))
                            throw $TypeError(".outray.otlp.Sum.dataPoints: object expected");
                        message.dataPoints[i] = $root.outray.otlp.NumberDataPoint.fromObject(object.dataPoints[i], _depth + 1);
                    }
                }
                if (object.aggregationTemporality !== 0 && (typeof object.aggregationTemporality !== "string" || $root.outray.otlp.AggregationTemporality[object.aggregationTemporality] !== 0))
                    switch (object.aggregationTemporality) {
                    case "AGGREGATION_TEMPORALITY_UNSPECIFIED":
                    case 0:
                        message.aggregationTemporality = 0;
                        break;
                    case "AGGREGATION_TEMPORALITY_DELTA":
                    case 1:
                        message.aggregationTemporality = 1;
                        break;
                    case "AGGREGATION_TEMPORALITY_CUMULATIVE":
                    case 2:
                        message.aggregationTemporality = 2;
                        break;
                    default:
                        if (typeof object.aggregationTemporality === "number" && (object.aggregationTemporality | 0) === object.aggregationTemporality)
                            message.aggregationTemporality = object.aggregationTemporality;
                    }
                if (object.isMonotonic != null)
                    if (object.isMonotonic)
                        message.isMonotonic = $Boolean(object.isMonotonic);
                return message;
            };

            /**
             * Creates a plain object from a Sum message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.Sum
             * @static
             * @param {outray.otlp.Sum} message Sum
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            Sum.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.dataPoints = [];
                if (options.defaults) {
                    object.aggregationTemporality = options.enums === $String ? "AGGREGATION_TEMPORALITY_UNSPECIFIED" : 0;
                    object.isMonotonic = false;
                }
                if (message.dataPoints && message.dataPoints.length) {
                    object.dataPoints = $Array(message.dataPoints.length);
                    for (let j = 0; j < message.dataPoints.length; ++j)
                        object.dataPoints[j] = $root.outray.otlp.NumberDataPoint.toObject(message.dataPoints[j], options, _depth + 1);
                }
                if (message.aggregationTemporality != null && $Object.hasOwnProperty.call(message, "aggregationTemporality"))
                    object.aggregationTemporality = options.enums === $String ? $root.outray.otlp.AggregationTemporality[message.aggregationTemporality] === $undefined ? message.aggregationTemporality : $root.outray.otlp.AggregationTemporality[message.aggregationTemporality] : message.aggregationTemporality;
                if (message.isMonotonic != null && $Object.hasOwnProperty.call(message, "isMonotonic"))
                    object.isMonotonic = message.isMonotonic;
                return object;
            };

            /**
             * Converts this Sum to JSON.
             * @function toJSON
             * @memberof outray.otlp.Sum
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            Sum.prototype.toJSON = function() {
                return Sum.toObject(this, $protobuf.util.toJSONOptions);
            };

            return Sum;
        })();

        otlp.Histogram = (function() {

            /**
             * Properties of a Histogram.
             * @typedef {Object} outray.otlp.Histogram.$Properties
             * @property {Array.<outray.otlp.HistogramDataPoint.$Properties>|null} [dataPoints] Histogram dataPoints
             * @property {outray.otlp.AggregationTemporality|null} [aggregationTemporality] Histogram aggregationTemporality
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of a Histogram.
             * @memberof outray.otlp
             * @interface IHistogram
             * @augments outray.otlp.Histogram.$Properties
             * @deprecated Use outray.otlp.Histogram.$Properties instead.
             */

            /**
             * Shape of a Histogram.
             * @typedef {{
             *   dataPoints?: Array.<outray.otlp.HistogramDataPoint.$Shape>|null;
             *   aggregationTemporality?: outray.otlp.AggregationTemporality|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.Histogram.$Shape
             */

            /**
             * Constructs a new Histogram.
             * @memberof outray.otlp
             * @classdesc Represents a Histogram.
             * @constructor
             * @param {outray.otlp.Histogram.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const Histogram = function (properties) {
                this.dataPoints = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * Histogram dataPoints.
             * @member {Array.<outray.otlp.HistogramDataPoint.$Properties>} dataPoints
             * @memberof outray.otlp.Histogram
             * @instance
             */
            Histogram.prototype.dataPoints = $util.emptyArray;

            /**
             * Histogram aggregationTemporality.
             * @member {outray.otlp.AggregationTemporality} aggregationTemporality
             * @memberof outray.otlp.Histogram
             * @instance
             */
            Histogram.prototype.aggregationTemporality = 0;

            /**
             * Creates a new Histogram instance using the specified properties.
             * @function create
             * @memberof outray.otlp.Histogram
             * @static
             * @param {outray.otlp.Histogram.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.Histogram} Histogram instance
             * @type {{
             *   (properties: outray.otlp.Histogram.$Shape): outray.otlp.Histogram & outray.otlp.Histogram.$Shape;
             *   (properties?: outray.otlp.Histogram.$Properties): outray.otlp.Histogram;
             * }}
             */
            Histogram.create = function(properties) {
                return new Histogram(properties);
            };

            /**
             * Encodes the specified Histogram message. Does not implicitly {@link outray.otlp.Histogram.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.Histogram
             * @static
             * @param {outray.otlp.Histogram.$Properties} message Histogram message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Histogram.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.dataPoints != null && message.dataPoints.length)
                    for (let i = 0; i < message.dataPoints.length; ++i)
                        $root.outray.otlp.HistogramDataPoint.encode(message.dataPoints[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
                if (message.aggregationTemporality != null && $Object.hasOwnProperty.call(message, "aggregationTemporality") && message.aggregationTemporality !== 0)
                    writer.uint32(/* id 2, wireType 0 =*/16).int32(message.aggregationTemporality);
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes a Histogram message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.Histogram
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.Histogram & outray.otlp.Histogram.$Shape} Histogram
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Histogram.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.Histogram();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            if (!(message.dataPoints && message.dataPoints.length))
                                message.dataPoints = [];
                            message.dataPoints.push($root.outray.otlp.HistogramDataPoint.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 2: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.int32())
                                message.aggregationTemporality = value;
                            else
                                delete message.aggregationTemporality;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates a Histogram message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.Histogram
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.Histogram} Histogram
             */
            Histogram.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.Histogram)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.Histogram: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.Histogram();
                if (object.dataPoints) {
                    if (!$Array.isArray(object.dataPoints))
                        throw $TypeError(".outray.otlp.Histogram.dataPoints: array expected");
                    message.dataPoints = $Array(object.dataPoints.length);
                    for (let i = 0; i < object.dataPoints.length; ++i) {
                        if (!$util.isObject(object.dataPoints[i]))
                            throw $TypeError(".outray.otlp.Histogram.dataPoints: object expected");
                        message.dataPoints[i] = $root.outray.otlp.HistogramDataPoint.fromObject(object.dataPoints[i], _depth + 1);
                    }
                }
                if (object.aggregationTemporality !== 0 && (typeof object.aggregationTemporality !== "string" || $root.outray.otlp.AggregationTemporality[object.aggregationTemporality] !== 0))
                    switch (object.aggregationTemporality) {
                    case "AGGREGATION_TEMPORALITY_UNSPECIFIED":
                    case 0:
                        message.aggregationTemporality = 0;
                        break;
                    case "AGGREGATION_TEMPORALITY_DELTA":
                    case 1:
                        message.aggregationTemporality = 1;
                        break;
                    case "AGGREGATION_TEMPORALITY_CUMULATIVE":
                    case 2:
                        message.aggregationTemporality = 2;
                        break;
                    default:
                        if (typeof object.aggregationTemporality === "number" && (object.aggregationTemporality | 0) === object.aggregationTemporality)
                            message.aggregationTemporality = object.aggregationTemporality;
                    }
                return message;
            };

            /**
             * Creates a plain object from a Histogram message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.Histogram
             * @static
             * @param {outray.otlp.Histogram} message Histogram
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            Histogram.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.dataPoints = [];
                if (options.defaults)
                    object.aggregationTemporality = options.enums === $String ? "AGGREGATION_TEMPORALITY_UNSPECIFIED" : 0;
                if (message.dataPoints && message.dataPoints.length) {
                    object.dataPoints = $Array(message.dataPoints.length);
                    for (let j = 0; j < message.dataPoints.length; ++j)
                        object.dataPoints[j] = $root.outray.otlp.HistogramDataPoint.toObject(message.dataPoints[j], options, _depth + 1);
                }
                if (message.aggregationTemporality != null && $Object.hasOwnProperty.call(message, "aggregationTemporality"))
                    object.aggregationTemporality = options.enums === $String ? $root.outray.otlp.AggregationTemporality[message.aggregationTemporality] === $undefined ? message.aggregationTemporality : $root.outray.otlp.AggregationTemporality[message.aggregationTemporality] : message.aggregationTemporality;
                return object;
            };

            /**
             * Converts this Histogram to JSON.
             * @function toJSON
             * @memberof outray.otlp.Histogram
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            Histogram.prototype.toJSON = function() {
                return Histogram.toObject(this, $protobuf.util.toJSONOptions);
            };

            return Histogram;
        })();

        otlp.ExponentialHistogram = (function() {

            /**
             * Properties of an ExponentialHistogram.
             * @typedef {Object} outray.otlp.ExponentialHistogram.$Properties
             * @property {Array.<outray.otlp.ExponentialHistogramDataPoint.$Properties>|null} [dataPoints] ExponentialHistogram dataPoints
             * @property {outray.otlp.AggregationTemporality|null} [aggregationTemporality] ExponentialHistogram aggregationTemporality
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of an ExponentialHistogram.
             * @memberof outray.otlp
             * @interface IExponentialHistogram
             * @augments outray.otlp.ExponentialHistogram.$Properties
             * @deprecated Use outray.otlp.ExponentialHistogram.$Properties instead.
             */

            /**
             * Shape of an ExponentialHistogram.
             * @typedef {{
             *   dataPoints?: Array.<outray.otlp.ExponentialHistogramDataPoint.$Shape>|null;
             *   aggregationTemporality?: outray.otlp.AggregationTemporality|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.ExponentialHistogram.$Shape
             */

            /**
             * Constructs a new ExponentialHistogram.
             * @memberof outray.otlp
             * @classdesc Represents an ExponentialHistogram.
             * @constructor
             * @param {outray.otlp.ExponentialHistogram.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const ExponentialHistogram = function (properties) {
                this.dataPoints = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * ExponentialHistogram dataPoints.
             * @member {Array.<outray.otlp.ExponentialHistogramDataPoint.$Properties>} dataPoints
             * @memberof outray.otlp.ExponentialHistogram
             * @instance
             */
            ExponentialHistogram.prototype.dataPoints = $util.emptyArray;

            /**
             * ExponentialHistogram aggregationTemporality.
             * @member {outray.otlp.AggregationTemporality} aggregationTemporality
             * @memberof outray.otlp.ExponentialHistogram
             * @instance
             */
            ExponentialHistogram.prototype.aggregationTemporality = 0;

            /**
             * Creates a new ExponentialHistogram instance using the specified properties.
             * @function create
             * @memberof outray.otlp.ExponentialHistogram
             * @static
             * @param {outray.otlp.ExponentialHistogram.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.ExponentialHistogram} ExponentialHistogram instance
             * @type {{
             *   (properties: outray.otlp.ExponentialHistogram.$Shape): outray.otlp.ExponentialHistogram & outray.otlp.ExponentialHistogram.$Shape;
             *   (properties?: outray.otlp.ExponentialHistogram.$Properties): outray.otlp.ExponentialHistogram;
             * }}
             */
            ExponentialHistogram.create = function(properties) {
                return new ExponentialHistogram(properties);
            };

            /**
             * Encodes the specified ExponentialHistogram message. Does not implicitly {@link outray.otlp.ExponentialHistogram.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.ExponentialHistogram
             * @static
             * @param {outray.otlp.ExponentialHistogram.$Properties} message ExponentialHistogram message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ExponentialHistogram.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.dataPoints != null && message.dataPoints.length)
                    for (let i = 0; i < message.dataPoints.length; ++i)
                        $root.outray.otlp.ExponentialHistogramDataPoint.encode(message.dataPoints[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
                if (message.aggregationTemporality != null && $Object.hasOwnProperty.call(message, "aggregationTemporality") && message.aggregationTemporality !== 0)
                    writer.uint32(/* id 2, wireType 0 =*/16).int32(message.aggregationTemporality);
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes an ExponentialHistogram message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.ExponentialHistogram
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.ExponentialHistogram & outray.otlp.ExponentialHistogram.$Shape} ExponentialHistogram
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ExponentialHistogram.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.ExponentialHistogram();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            if (!(message.dataPoints && message.dataPoints.length))
                                message.dataPoints = [];
                            message.dataPoints.push($root.outray.otlp.ExponentialHistogramDataPoint.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 2: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.int32())
                                message.aggregationTemporality = value;
                            else
                                delete message.aggregationTemporality;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates an ExponentialHistogram message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.ExponentialHistogram
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.ExponentialHistogram} ExponentialHistogram
             */
            ExponentialHistogram.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.ExponentialHistogram)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.ExponentialHistogram: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.ExponentialHistogram();
                if (object.dataPoints) {
                    if (!$Array.isArray(object.dataPoints))
                        throw $TypeError(".outray.otlp.ExponentialHistogram.dataPoints: array expected");
                    message.dataPoints = $Array(object.dataPoints.length);
                    for (let i = 0; i < object.dataPoints.length; ++i) {
                        if (!$util.isObject(object.dataPoints[i]))
                            throw $TypeError(".outray.otlp.ExponentialHistogram.dataPoints: object expected");
                        message.dataPoints[i] = $root.outray.otlp.ExponentialHistogramDataPoint.fromObject(object.dataPoints[i], _depth + 1);
                    }
                }
                if (object.aggregationTemporality !== 0 && (typeof object.aggregationTemporality !== "string" || $root.outray.otlp.AggregationTemporality[object.aggregationTemporality] !== 0))
                    switch (object.aggregationTemporality) {
                    case "AGGREGATION_TEMPORALITY_UNSPECIFIED":
                    case 0:
                        message.aggregationTemporality = 0;
                        break;
                    case "AGGREGATION_TEMPORALITY_DELTA":
                    case 1:
                        message.aggregationTemporality = 1;
                        break;
                    case "AGGREGATION_TEMPORALITY_CUMULATIVE":
                    case 2:
                        message.aggregationTemporality = 2;
                        break;
                    default:
                        if (typeof object.aggregationTemporality === "number" && (object.aggregationTemporality | 0) === object.aggregationTemporality)
                            message.aggregationTemporality = object.aggregationTemporality;
                    }
                return message;
            };

            /**
             * Creates a plain object from an ExponentialHistogram message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.ExponentialHistogram
             * @static
             * @param {outray.otlp.ExponentialHistogram} message ExponentialHistogram
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ExponentialHistogram.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.dataPoints = [];
                if (options.defaults)
                    object.aggregationTemporality = options.enums === $String ? "AGGREGATION_TEMPORALITY_UNSPECIFIED" : 0;
                if (message.dataPoints && message.dataPoints.length) {
                    object.dataPoints = $Array(message.dataPoints.length);
                    for (let j = 0; j < message.dataPoints.length; ++j)
                        object.dataPoints[j] = $root.outray.otlp.ExponentialHistogramDataPoint.toObject(message.dataPoints[j], options, _depth + 1);
                }
                if (message.aggregationTemporality != null && $Object.hasOwnProperty.call(message, "aggregationTemporality"))
                    object.aggregationTemporality = options.enums === $String ? $root.outray.otlp.AggregationTemporality[message.aggregationTemporality] === $undefined ? message.aggregationTemporality : $root.outray.otlp.AggregationTemporality[message.aggregationTemporality] : message.aggregationTemporality;
                return object;
            };

            /**
             * Converts this ExponentialHistogram to JSON.
             * @function toJSON
             * @memberof outray.otlp.ExponentialHistogram
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ExponentialHistogram.prototype.toJSON = function() {
                return ExponentialHistogram.toObject(this, $protobuf.util.toJSONOptions);
            };

            return ExponentialHistogram;
        })();

        otlp.Summary = (function() {

            /**
             * Properties of a Summary.
             * @typedef {Object} outray.otlp.Summary.$Properties
             * @property {Array.<outray.otlp.SummaryDataPoint.$Properties>|null} [dataPoints] Summary dataPoints
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of a Summary.
             * @memberof outray.otlp
             * @interface ISummary
             * @augments outray.otlp.Summary.$Properties
             * @deprecated Use outray.otlp.Summary.$Properties instead.
             */

            /**
             * Shape of a Summary.
             * @typedef {{
             *   dataPoints?: Array.<outray.otlp.SummaryDataPoint.$Shape>|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.Summary.$Shape
             */

            /**
             * Constructs a new Summary.
             * @memberof outray.otlp
             * @classdesc Represents a Summary.
             * @constructor
             * @param {outray.otlp.Summary.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const Summary = function (properties) {
                this.dataPoints = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * Summary dataPoints.
             * @member {Array.<outray.otlp.SummaryDataPoint.$Properties>} dataPoints
             * @memberof outray.otlp.Summary
             * @instance
             */
            Summary.prototype.dataPoints = $util.emptyArray;

            /**
             * Creates a new Summary instance using the specified properties.
             * @function create
             * @memberof outray.otlp.Summary
             * @static
             * @param {outray.otlp.Summary.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.Summary} Summary instance
             * @type {{
             *   (properties: outray.otlp.Summary.$Shape): outray.otlp.Summary & outray.otlp.Summary.$Shape;
             *   (properties?: outray.otlp.Summary.$Properties): outray.otlp.Summary;
             * }}
             */
            Summary.create = function(properties) {
                return new Summary(properties);
            };

            /**
             * Encodes the specified Summary message. Does not implicitly {@link outray.otlp.Summary.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.Summary
             * @static
             * @param {outray.otlp.Summary.$Properties} message Summary message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Summary.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.dataPoints != null && message.dataPoints.length)
                    for (let i = 0; i < message.dataPoints.length; ++i)
                        $root.outray.otlp.SummaryDataPoint.encode(message.dataPoints[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes a Summary message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.Summary
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.Summary & outray.otlp.Summary.$Shape} Summary
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Summary.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.Summary();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            if (!(message.dataPoints && message.dataPoints.length))
                                message.dataPoints = [];
                            message.dataPoints.push($root.outray.otlp.SummaryDataPoint.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates a Summary message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.Summary
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.Summary} Summary
             */
            Summary.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.Summary)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.Summary: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.Summary();
                if (object.dataPoints) {
                    if (!$Array.isArray(object.dataPoints))
                        throw $TypeError(".outray.otlp.Summary.dataPoints: array expected");
                    message.dataPoints = $Array(object.dataPoints.length);
                    for (let i = 0; i < object.dataPoints.length; ++i) {
                        if (!$util.isObject(object.dataPoints[i]))
                            throw $TypeError(".outray.otlp.Summary.dataPoints: object expected");
                        message.dataPoints[i] = $root.outray.otlp.SummaryDataPoint.fromObject(object.dataPoints[i], _depth + 1);
                    }
                }
                return message;
            };

            /**
             * Creates a plain object from a Summary message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.Summary
             * @static
             * @param {outray.otlp.Summary} message Summary
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            Summary.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.dataPoints = [];
                if (message.dataPoints && message.dataPoints.length) {
                    object.dataPoints = $Array(message.dataPoints.length);
                    for (let j = 0; j < message.dataPoints.length; ++j)
                        object.dataPoints[j] = $root.outray.otlp.SummaryDataPoint.toObject(message.dataPoints[j], options, _depth + 1);
                }
                return object;
            };

            /**
             * Converts this Summary to JSON.
             * @function toJSON
             * @memberof outray.otlp.Summary
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            Summary.prototype.toJSON = function() {
                return Summary.toObject(this, $protobuf.util.toJSONOptions);
            };

            return Summary;
        })();

        /**
         * AggregationTemporality enum.
         * @name outray.otlp.AggregationTemporality
         * @enum {number}
         * @property {number} AGGREGATION_TEMPORALITY_UNSPECIFIED=0 AGGREGATION_TEMPORALITY_UNSPECIFIED value
         * @property {number} AGGREGATION_TEMPORALITY_DELTA=1 AGGREGATION_TEMPORALITY_DELTA value
         * @property {number} AGGREGATION_TEMPORALITY_CUMULATIVE=2 AGGREGATION_TEMPORALITY_CUMULATIVE value
         */
        otlp.AggregationTemporality = (function() {
            const valuesById = $Object.create(null), values = $Object.create(valuesById);
            values[valuesById[0] = "AGGREGATION_TEMPORALITY_UNSPECIFIED"] = 0;
            values[valuesById[1] = "AGGREGATION_TEMPORALITY_DELTA"] = 1;
            values[valuesById[2] = "AGGREGATION_TEMPORALITY_CUMULATIVE"] = 2;
            return values;
        })();

        otlp.NumberDataPoint = (function() {

            /**
             * Properties of a NumberDataPoint.
             * @typedef {Object} outray.otlp.NumberDataPoint.$Properties
             * @property {Array.<outray.otlp.KeyValue.$Properties>|null} [attributes] NumberDataPoint attributes
             * @property {number|Long|null} [startTimeUnixNano] NumberDataPoint startTimeUnixNano
             * @property {number|Long|null} [timeUnixNano] NumberDataPoint timeUnixNano
             * @property {number|null} [asDouble] NumberDataPoint asDouble
             * @property {number|Long|null} [asInt] NumberDataPoint asInt
             * @property {Array.<outray.otlp.Exemplar.$Properties>|null} [exemplars] NumberDataPoint exemplars
             * @property {number|null} [flags] NumberDataPoint flags
             * @property {"asDouble"|"asInt"} [value] NumberDataPoint value
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of a NumberDataPoint.
             * @memberof outray.otlp
             * @interface INumberDataPoint
             * @augments outray.otlp.NumberDataPoint.$Properties
             * @deprecated Use outray.otlp.NumberDataPoint.$Properties instead.
             */

            /**
             * Narrowed shape of a NumberDataPoint.
             * @typedef {{
             *   attributes?: Array.<outray.otlp.KeyValue.$Shape>|null;
             *   startTimeUnixNano?: number|Long|null;
             *   timeUnixNano?: number|Long|null;
             *   asDouble?: number|null;
             *   asInt?: number|Long|null;
             *   exemplars?: Array.<outray.otlp.Exemplar.$Shape>|null;
             *   flags?: number|null;
             *   $unknowns?: Array.<Uint8Array>;
             * } & (
             *   ({ value?: undefined; asDouble?: null; asInt?: null }|{ value?: "asDouble"; asDouble: number; asInt?: null }|{ value?: "asInt"; asDouble?: null; asInt: number|Long })
             * )} outray.otlp.NumberDataPoint.$Shape
             */

            /**
             * Constructs a new NumberDataPoint.
             * @memberof outray.otlp
             * @classdesc Represents a NumberDataPoint.
             * @constructor
             * @param {outray.otlp.NumberDataPoint.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const NumberDataPoint = function (properties) {
                this.attributes = [];
                this.exemplars = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * NumberDataPoint attributes.
             * @member {Array.<outray.otlp.KeyValue.$Properties>} attributes
             * @memberof outray.otlp.NumberDataPoint
             * @instance
             */
            NumberDataPoint.prototype.attributes = $util.emptyArray;

            /**
             * NumberDataPoint startTimeUnixNano.
             * @member {number|Long} startTimeUnixNano
             * @memberof outray.otlp.NumberDataPoint
             * @instance
             */
            NumberDataPoint.prototype.startTimeUnixNano = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * NumberDataPoint timeUnixNano.
             * @member {number|Long} timeUnixNano
             * @memberof outray.otlp.NumberDataPoint
             * @instance
             */
            NumberDataPoint.prototype.timeUnixNano = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * NumberDataPoint asDouble.
             * @member {number|null|undefined} asDouble
             * @memberof outray.otlp.NumberDataPoint
             * @instance
             */
            NumberDataPoint.prototype.asDouble = null;

            /**
             * NumberDataPoint asInt.
             * @member {number|Long|null|undefined} asInt
             * @memberof outray.otlp.NumberDataPoint
             * @instance
             */
            NumberDataPoint.prototype.asInt = null;

            /**
             * NumberDataPoint exemplars.
             * @member {Array.<outray.otlp.Exemplar.$Properties>} exemplars
             * @memberof outray.otlp.NumberDataPoint
             * @instance
             */
            NumberDataPoint.prototype.exemplars = $util.emptyArray;

            /**
             * NumberDataPoint flags.
             * @member {number} flags
             * @memberof outray.otlp.NumberDataPoint
             * @instance
             */
            NumberDataPoint.prototype.flags = 0;

            // OneOf field names bound to virtual getters and setters
            let $oneOfFields;

            /**
             * NumberDataPoint value.
             * @member {"asDouble"|"asInt"|undefined} value
             * @memberof outray.otlp.NumberDataPoint
             * @instance
             */
            $Object.defineProperty(NumberDataPoint.prototype, "value", {
                get: $util.oneOfGetter($oneOfFields = ["asDouble", "asInt"]),
                set: $util.oneOfSetter($oneOfFields)
            });

            /**
             * Creates a new NumberDataPoint instance using the specified properties.
             * @function create
             * @memberof outray.otlp.NumberDataPoint
             * @static
             * @param {outray.otlp.NumberDataPoint.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.NumberDataPoint} NumberDataPoint instance
             * @type {{
             *   (properties: outray.otlp.NumberDataPoint.$Shape): outray.otlp.NumberDataPoint & outray.otlp.NumberDataPoint.$Shape;
             *   (properties?: outray.otlp.NumberDataPoint.$Properties): outray.otlp.NumberDataPoint;
             * }}
             */
            NumberDataPoint.create = function(properties) {
                return new NumberDataPoint(properties);
            };

            /**
             * Encodes the specified NumberDataPoint message. Does not implicitly {@link outray.otlp.NumberDataPoint.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.NumberDataPoint
             * @static
             * @param {outray.otlp.NumberDataPoint.$Properties} message NumberDataPoint message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            NumberDataPoint.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.startTimeUnixNano != null && $Object.hasOwnProperty.call(message, "startTimeUnixNano") && (typeof message.startTimeUnixNano === "object" ? message.startTimeUnixNano.low || message.startTimeUnixNano.high : message.startTimeUnixNano !== 0))
                    writer.uint32(/* id 2, wireType 1 =*/17).fixed64(message.startTimeUnixNano);
                if (message.timeUnixNano != null && $Object.hasOwnProperty.call(message, "timeUnixNano") && (typeof message.timeUnixNano === "object" ? message.timeUnixNano.low || message.timeUnixNano.high : message.timeUnixNano !== 0))
                    writer.uint32(/* id 3, wireType 1 =*/25).fixed64(message.timeUnixNano);
                if (message.asDouble != null && $Object.hasOwnProperty.call(message, "asDouble"))
                    writer.uint32(/* id 4, wireType 1 =*/33).double(message.asDouble);
                if (message.exemplars != null && message.exemplars.length)
                    for (let i = 0; i < message.exemplars.length; ++i)
                        $root.outray.otlp.Exemplar.encode(message.exemplars[i], writer.uint32(/* id 5, wireType 2 =*/42).fork(), _depth + 1).ldelim();
                if (message.asInt != null && $Object.hasOwnProperty.call(message, "asInt"))
                    writer.uint32(/* id 6, wireType 1 =*/49).sfixed64(message.asInt);
                if (message.attributes != null && message.attributes.length)
                    for (let i = 0; i < message.attributes.length; ++i)
                        $root.outray.otlp.KeyValue.encode(message.attributes[i], writer.uint32(/* id 7, wireType 2 =*/58).fork(), _depth + 1).ldelim();
                if (message.flags != null && $Object.hasOwnProperty.call(message, "flags") && message.flags !== 0)
                    writer.uint32(/* id 8, wireType 0 =*/64).uint32(message.flags);
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes a NumberDataPoint message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.NumberDataPoint
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.NumberDataPoint & outray.otlp.NumberDataPoint.$Shape} NumberDataPoint
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            NumberDataPoint.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.NumberDataPoint();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 7: {
                            if (wireType !== 2)
                                break;
                            if (!(message.attributes && message.attributes.length))
                                message.attributes = [];
                            message.attributes.push($root.outray.otlp.KeyValue.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 2: {
                            if (wireType !== 1)
                                break;
                            if (typeof (value = reader.fixed64()) === "object" ? value.low || value.high : value !== 0)
                                message.startTimeUnixNano = value;
                            else
                                delete message.startTimeUnixNano;
                            continue;
                        }
                    case 3: {
                            if (wireType !== 1)
                                break;
                            if (typeof (value = reader.fixed64()) === "object" ? value.low || value.high : value !== 0)
                                message.timeUnixNano = value;
                            else
                                delete message.timeUnixNano;
                            continue;
                        }
                    case 4: {
                            if (wireType !== 1)
                                break;
                            message.asDouble = reader.double();
                            message.value = "asDouble";
                            continue;
                        }
                    case 6: {
                            if (wireType !== 1)
                                break;
                            message.asInt = reader.sfixed64();
                            message.value = "asInt";
                            continue;
                        }
                    case 5: {
                            if (wireType !== 2)
                                break;
                            if (!(message.exemplars && message.exemplars.length))
                                message.exemplars = [];
                            message.exemplars.push($root.outray.otlp.Exemplar.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 8: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.uint32())
                                message.flags = value;
                            else
                                delete message.flags;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates a NumberDataPoint message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.NumberDataPoint
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.NumberDataPoint} NumberDataPoint
             */
            NumberDataPoint.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.NumberDataPoint)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.NumberDataPoint: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.NumberDataPoint();
                if (object.attributes) {
                    if (!$Array.isArray(object.attributes))
                        throw $TypeError(".outray.otlp.NumberDataPoint.attributes: array expected");
                    message.attributes = $Array(object.attributes.length);
                    for (let i = 0; i < object.attributes.length; ++i) {
                        if (!$util.isObject(object.attributes[i]))
                            throw $TypeError(".outray.otlp.NumberDataPoint.attributes: object expected");
                        message.attributes[i] = $root.outray.otlp.KeyValue.fromObject(object.attributes[i], _depth + 1);
                    }
                }
                if (object.startTimeUnixNano != null)
                    if (typeof object.startTimeUnixNano === "object" ? object.startTimeUnixNano.low || object.startTimeUnixNano.high : $Number(object.startTimeUnixNano) !== 0)
                        if ($util.Long)
                            message.startTimeUnixNano = $util.Long.fromValue(object.startTimeUnixNano, true);
                        else if (typeof object.startTimeUnixNano === "string")
                            message.startTimeUnixNano = $parseInt(object.startTimeUnixNano, 10);
                        else if (typeof object.startTimeUnixNano === "number")
                            message.startTimeUnixNano = object.startTimeUnixNano;
                        else if (typeof object.startTimeUnixNano === "object")
                            message.startTimeUnixNano = new $util.LongBits(object.startTimeUnixNano.low >>> 0, object.startTimeUnixNano.high >>> 0).toNumber(true);
                if (object.timeUnixNano != null)
                    if (typeof object.timeUnixNano === "object" ? object.timeUnixNano.low || object.timeUnixNano.high : $Number(object.timeUnixNano) !== 0)
                        if ($util.Long)
                            message.timeUnixNano = $util.Long.fromValue(object.timeUnixNano, true);
                        else if (typeof object.timeUnixNano === "string")
                            message.timeUnixNano = $parseInt(object.timeUnixNano, 10);
                        else if (typeof object.timeUnixNano === "number")
                            message.timeUnixNano = object.timeUnixNano;
                        else if (typeof object.timeUnixNano === "object")
                            message.timeUnixNano = new $util.LongBits(object.timeUnixNano.low >>> 0, object.timeUnixNano.high >>> 0).toNumber(true);
                if (object.asDouble != null)
                    message.asDouble = $Number(object.asDouble);
                if (object.asInt != null)
                    if ($util.Long)
                        message.asInt = $util.Long.fromValue(object.asInt, false);
                    else if (typeof object.asInt === "string")
                        message.asInt = $parseInt(object.asInt, 10);
                    else if (typeof object.asInt === "number")
                        message.asInt = object.asInt;
                    else if (typeof object.asInt === "object")
                        message.asInt = new $util.LongBits(object.asInt.low >>> 0, object.asInt.high >>> 0).toNumber();
                if (object.exemplars) {
                    if (!$Array.isArray(object.exemplars))
                        throw $TypeError(".outray.otlp.NumberDataPoint.exemplars: array expected");
                    message.exemplars = $Array(object.exemplars.length);
                    for (let i = 0; i < object.exemplars.length; ++i) {
                        if (!$util.isObject(object.exemplars[i]))
                            throw $TypeError(".outray.otlp.NumberDataPoint.exemplars: object expected");
                        message.exemplars[i] = $root.outray.otlp.Exemplar.fromObject(object.exemplars[i], _depth + 1);
                    }
                }
                if (object.flags != null)
                    if ($Number(object.flags) !== 0)
                        message.flags = object.flags >>> 0;
                return message;
            };

            /**
             * Creates a plain object from a NumberDataPoint message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.NumberDataPoint
             * @static
             * @param {outray.otlp.NumberDataPoint} message NumberDataPoint
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            NumberDataPoint.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults) {
                    object.exemplars = [];
                    object.attributes = [];
                }
                if (options.defaults) {
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, true);
                        object.startTimeUnixNano = options.longs === $String ? long.toString() : options.longs === $Number ? long.toNumber() : typeof $BigInt !== "undefined" && options.longs === $BigInt ? long.toBigInt() : long;
                    } else
                        object.startTimeUnixNano = options.longs === $String ? "0" : typeof $BigInt !== "undefined" && options.longs === $BigInt ? $BigInt("0") : 0;
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, true);
                        object.timeUnixNano = options.longs === $String ? long.toString() : options.longs === $Number ? long.toNumber() : typeof $BigInt !== "undefined" && options.longs === $BigInt ? long.toBigInt() : long;
                    } else
                        object.timeUnixNano = options.longs === $String ? "0" : typeof $BigInt !== "undefined" && options.longs === $BigInt ? $BigInt("0") : 0;
                    object.flags = 0;
                }
                if (message.startTimeUnixNano != null && $Object.hasOwnProperty.call(message, "startTimeUnixNano"))
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.startTimeUnixNano = typeof message.startTimeUnixNano === "number" ? $BigInt(message.startTimeUnixNano) : $util.Long.fromBits(message.startTimeUnixNano.low >>> 0, message.startTimeUnixNano.high >>> 0, true).toBigInt();
                    else if (typeof message.startTimeUnixNano === "number")
                        object.startTimeUnixNano = options.longs === $String ? $String(message.startTimeUnixNano) : message.startTimeUnixNano;
                    else
                        object.startTimeUnixNano = options.longs === $String ? $util.Long.prototype.toString.call(message.startTimeUnixNano) : options.longs === $Number ? new $util.LongBits(message.startTimeUnixNano.low >>> 0, message.startTimeUnixNano.high >>> 0).toNumber(true) : message.startTimeUnixNano;
                if (message.timeUnixNano != null && $Object.hasOwnProperty.call(message, "timeUnixNano"))
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.timeUnixNano = typeof message.timeUnixNano === "number" ? $BigInt(message.timeUnixNano) : $util.Long.fromBits(message.timeUnixNano.low >>> 0, message.timeUnixNano.high >>> 0, true).toBigInt();
                    else if (typeof message.timeUnixNano === "number")
                        object.timeUnixNano = options.longs === $String ? $String(message.timeUnixNano) : message.timeUnixNano;
                    else
                        object.timeUnixNano = options.longs === $String ? $util.Long.prototype.toString.call(message.timeUnixNano) : options.longs === $Number ? new $util.LongBits(message.timeUnixNano.low >>> 0, message.timeUnixNano.high >>> 0).toNumber(true) : message.timeUnixNano;
                if (message.asDouble != null && $Object.hasOwnProperty.call(message, "asDouble")) {
                    object.asDouble = options.json && !$isFinite(message.asDouble) ? $String(message.asDouble) : message.asDouble;
                    if (options.oneofs)
                        object.value = "asDouble";
                }
                if (message.exemplars && message.exemplars.length) {
                    object.exemplars = $Array(message.exemplars.length);
                    for (let j = 0; j < message.exemplars.length; ++j)
                        object.exemplars[j] = $root.outray.otlp.Exemplar.toObject(message.exemplars[j], options, _depth + 1);
                }
                if (message.asInt != null && $Object.hasOwnProperty.call(message, "asInt")) {
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.asInt = typeof message.asInt === "number" ? $BigInt(message.asInt) : $util.Long.fromBits(message.asInt.low >>> 0, message.asInt.high >>> 0, false).toBigInt();
                    else if (typeof message.asInt === "number")
                        object.asInt = options.longs === $String ? $String(message.asInt) : message.asInt;
                    else
                        object.asInt = options.longs === $String ? $util.Long.prototype.toString.call(message.asInt) : options.longs === $Number ? new $util.LongBits(message.asInt.low >>> 0, message.asInt.high >>> 0).toNumber() : message.asInt;
                    if (options.oneofs)
                        object.value = "asInt";
                }
                if (message.attributes && message.attributes.length) {
                    object.attributes = $Array(message.attributes.length);
                    for (let j = 0; j < message.attributes.length; ++j)
                        object.attributes[j] = $root.outray.otlp.KeyValue.toObject(message.attributes[j], options, _depth + 1);
                }
                if (message.flags != null && $Object.hasOwnProperty.call(message, "flags"))
                    object.flags = message.flags;
                return object;
            };

            /**
             * Converts this NumberDataPoint to JSON.
             * @function toJSON
             * @memberof outray.otlp.NumberDataPoint
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            NumberDataPoint.prototype.toJSON = function() {
                return NumberDataPoint.toObject(this, $protobuf.util.toJSONOptions);
            };

            return NumberDataPoint;
        })();

        otlp.HistogramDataPoint = (function() {

            /**
             * Properties of a HistogramDataPoint.
             * @typedef {Object} outray.otlp.HistogramDataPoint.$Properties
             * @property {Array.<outray.otlp.KeyValue.$Properties>|null} [attributes] HistogramDataPoint attributes
             * @property {number|Long|null} [startTimeUnixNano] HistogramDataPoint startTimeUnixNano
             * @property {number|Long|null} [timeUnixNano] HistogramDataPoint timeUnixNano
             * @property {number|Long|null} [count] HistogramDataPoint count
             * @property {number|null} [sum] HistogramDataPoint sum
             * @property {Array.<number|Long>|null} [bucketCounts] HistogramDataPoint bucketCounts
             * @property {Array.<number>|null} [explicitBounds] HistogramDataPoint explicitBounds
             * @property {Array.<outray.otlp.Exemplar.$Properties>|null} [exemplars] HistogramDataPoint exemplars
             * @property {number|null} [flags] HistogramDataPoint flags
             * @property {number|null} [min] HistogramDataPoint min
             * @property {number|null} [max] HistogramDataPoint max
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of a HistogramDataPoint.
             * @memberof outray.otlp
             * @interface IHistogramDataPoint
             * @augments outray.otlp.HistogramDataPoint.$Properties
             * @deprecated Use outray.otlp.HistogramDataPoint.$Properties instead.
             */

            /**
             * Shape of a HistogramDataPoint.
             * @typedef {{
             *   attributes?: Array.<outray.otlp.KeyValue.$Shape>|null;
             *   startTimeUnixNano?: number|Long|null;
             *   timeUnixNano?: number|Long|null;
             *   count?: number|Long|null;
             *   sum?: number|null;
             *   bucketCounts?: Array.<number|Long>|null;
             *   explicitBounds?: Array.<number>|null;
             *   exemplars?: Array.<outray.otlp.Exemplar.$Shape>|null;
             *   flags?: number|null;
             *   min?: number|null;
             *   max?: number|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.HistogramDataPoint.$Shape
             */

            /**
             * Constructs a new HistogramDataPoint.
             * @memberof outray.otlp
             * @classdesc Represents a HistogramDataPoint.
             * @constructor
             * @param {outray.otlp.HistogramDataPoint.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const HistogramDataPoint = function (properties) {
                this.attributes = [];
                this.bucketCounts = [];
                this.explicitBounds = [];
                this.exemplars = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * HistogramDataPoint attributes.
             * @member {Array.<outray.otlp.KeyValue.$Properties>} attributes
             * @memberof outray.otlp.HistogramDataPoint
             * @instance
             */
            HistogramDataPoint.prototype.attributes = $util.emptyArray;

            /**
             * HistogramDataPoint startTimeUnixNano.
             * @member {number|Long} startTimeUnixNano
             * @memberof outray.otlp.HistogramDataPoint
             * @instance
             */
            HistogramDataPoint.prototype.startTimeUnixNano = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * HistogramDataPoint timeUnixNano.
             * @member {number|Long} timeUnixNano
             * @memberof outray.otlp.HistogramDataPoint
             * @instance
             */
            HistogramDataPoint.prototype.timeUnixNano = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * HistogramDataPoint count.
             * @member {number|Long} count
             * @memberof outray.otlp.HistogramDataPoint
             * @instance
             */
            HistogramDataPoint.prototype.count = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * HistogramDataPoint sum.
             * @member {number|null|undefined} sum
             * @memberof outray.otlp.HistogramDataPoint
             * @instance
             */
            HistogramDataPoint.prototype.sum = null;

            /**
             * HistogramDataPoint bucketCounts.
             * @member {Array.<number|Long>} bucketCounts
             * @memberof outray.otlp.HistogramDataPoint
             * @instance
             */
            HistogramDataPoint.prototype.bucketCounts = $util.emptyArray;

            /**
             * HistogramDataPoint explicitBounds.
             * @member {Array.<number>} explicitBounds
             * @memberof outray.otlp.HistogramDataPoint
             * @instance
             */
            HistogramDataPoint.prototype.explicitBounds = $util.emptyArray;

            /**
             * HistogramDataPoint exemplars.
             * @member {Array.<outray.otlp.Exemplar.$Properties>} exemplars
             * @memberof outray.otlp.HistogramDataPoint
             * @instance
             */
            HistogramDataPoint.prototype.exemplars = $util.emptyArray;

            /**
             * HistogramDataPoint flags.
             * @member {number} flags
             * @memberof outray.otlp.HistogramDataPoint
             * @instance
             */
            HistogramDataPoint.prototype.flags = 0;

            /**
             * HistogramDataPoint min.
             * @member {number|null|undefined} min
             * @memberof outray.otlp.HistogramDataPoint
             * @instance
             */
            HistogramDataPoint.prototype.min = null;

            /**
             * HistogramDataPoint max.
             * @member {number|null|undefined} max
             * @memberof outray.otlp.HistogramDataPoint
             * @instance
             */
            HistogramDataPoint.prototype.max = null;

            // OneOf field names bound to virtual getters and setters
            let $oneOfFields;

            // Virtual OneOf for proto3 optional field
            $Object.defineProperty(HistogramDataPoint.prototype, "_sum", {
                get: $util.oneOfGetter($oneOfFields = ["sum"]),
                set: $util.oneOfSetter($oneOfFields)
            });

            // Virtual OneOf for proto3 optional field
            $Object.defineProperty(HistogramDataPoint.prototype, "_min", {
                get: $util.oneOfGetter($oneOfFields = ["min"]),
                set: $util.oneOfSetter($oneOfFields)
            });

            // Virtual OneOf for proto3 optional field
            $Object.defineProperty(HistogramDataPoint.prototype, "_max", {
                get: $util.oneOfGetter($oneOfFields = ["max"]),
                set: $util.oneOfSetter($oneOfFields)
            });

            /**
             * Creates a new HistogramDataPoint instance using the specified properties.
             * @function create
             * @memberof outray.otlp.HistogramDataPoint
             * @static
             * @param {outray.otlp.HistogramDataPoint.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.HistogramDataPoint} HistogramDataPoint instance
             * @type {{
             *   (properties: outray.otlp.HistogramDataPoint.$Shape): outray.otlp.HistogramDataPoint & outray.otlp.HistogramDataPoint.$Shape;
             *   (properties?: outray.otlp.HistogramDataPoint.$Properties): outray.otlp.HistogramDataPoint;
             * }}
             */
            HistogramDataPoint.create = function(properties) {
                return new HistogramDataPoint(properties);
            };

            /**
             * Encodes the specified HistogramDataPoint message. Does not implicitly {@link outray.otlp.HistogramDataPoint.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.HistogramDataPoint
             * @static
             * @param {outray.otlp.HistogramDataPoint.$Properties} message HistogramDataPoint message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            HistogramDataPoint.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.startTimeUnixNano != null && $Object.hasOwnProperty.call(message, "startTimeUnixNano") && (typeof message.startTimeUnixNano === "object" ? message.startTimeUnixNano.low || message.startTimeUnixNano.high : message.startTimeUnixNano !== 0))
                    writer.uint32(/* id 2, wireType 1 =*/17).fixed64(message.startTimeUnixNano);
                if (message.timeUnixNano != null && $Object.hasOwnProperty.call(message, "timeUnixNano") && (typeof message.timeUnixNano === "object" ? message.timeUnixNano.low || message.timeUnixNano.high : message.timeUnixNano !== 0))
                    writer.uint32(/* id 3, wireType 1 =*/25).fixed64(message.timeUnixNano);
                if (message.count != null && $Object.hasOwnProperty.call(message, "count") && (typeof message.count === "object" ? message.count.low || message.count.high : message.count !== 0))
                    writer.uint32(/* id 4, wireType 1 =*/33).fixed64(message.count);
                if (message.sum != null && $Object.hasOwnProperty.call(message, "sum"))
                    writer.uint32(/* id 5, wireType 1 =*/41).double(message.sum);
                if (message.bucketCounts != null && message.bucketCounts.length)
                    writer.uint32(/* id 6, wireType 2 =*/50).fixed64s(message.bucketCounts);
                if (message.explicitBounds != null && message.explicitBounds.length)
                    writer.uint32(/* id 7, wireType 2 =*/58).doubles(message.explicitBounds);
                if (message.exemplars != null && message.exemplars.length)
                    for (let i = 0; i < message.exemplars.length; ++i)
                        $root.outray.otlp.Exemplar.encode(message.exemplars[i], writer.uint32(/* id 8, wireType 2 =*/66).fork(), _depth + 1).ldelim();
                if (message.attributes != null && message.attributes.length)
                    for (let i = 0; i < message.attributes.length; ++i)
                        $root.outray.otlp.KeyValue.encode(message.attributes[i], writer.uint32(/* id 9, wireType 2 =*/74).fork(), _depth + 1).ldelim();
                if (message.flags != null && $Object.hasOwnProperty.call(message, "flags") && message.flags !== 0)
                    writer.uint32(/* id 10, wireType 0 =*/80).uint32(message.flags);
                if (message.min != null && $Object.hasOwnProperty.call(message, "min"))
                    writer.uint32(/* id 11, wireType 1 =*/89).double(message.min);
                if (message.max != null && $Object.hasOwnProperty.call(message, "max"))
                    writer.uint32(/* id 12, wireType 1 =*/97).double(message.max);
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes a HistogramDataPoint message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.HistogramDataPoint
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.HistogramDataPoint & outray.otlp.HistogramDataPoint.$Shape} HistogramDataPoint
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            HistogramDataPoint.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.HistogramDataPoint();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 9: {
                            if (wireType !== 2)
                                break;
                            if (!(message.attributes && message.attributes.length))
                                message.attributes = [];
                            message.attributes.push($root.outray.otlp.KeyValue.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 2: {
                            if (wireType !== 1)
                                break;
                            if (typeof (value = reader.fixed64()) === "object" ? value.low || value.high : value !== 0)
                                message.startTimeUnixNano = value;
                            else
                                delete message.startTimeUnixNano;
                            continue;
                        }
                    case 3: {
                            if (wireType !== 1)
                                break;
                            if (typeof (value = reader.fixed64()) === "object" ? value.low || value.high : value !== 0)
                                message.timeUnixNano = value;
                            else
                                delete message.timeUnixNano;
                            continue;
                        }
                    case 4: {
                            if (wireType !== 1)
                                break;
                            if (typeof (value = reader.fixed64()) === "object" ? value.low || value.high : value !== 0)
                                message.count = value;
                            else
                                delete message.count;
                            continue;
                        }
                    case 5: {
                            if (wireType !== 1)
                                break;
                            message.sum = reader.double();
                            message._sum = "sum";
                            continue;
                        }
                    case 6: {
                            if (wireType === 2) {
                                if (!(message.bucketCounts && message.bucketCounts.length))
                                    message.bucketCounts = [];
                                reader.fixed64s(message.bucketCounts);
                                continue;
                            }
                            if (wireType !== 1)
                                break;
                            if (!(message.bucketCounts && message.bucketCounts.length))
                                message.bucketCounts = [];
                            message.bucketCounts.push(reader.fixed64());
                            continue;
                        }
                    case 7: {
                            if (wireType === 2) {
                                if (!(message.explicitBounds && message.explicitBounds.length))
                                    message.explicitBounds = [];
                                reader.doubles(message.explicitBounds);
                                continue;
                            }
                            if (wireType !== 1)
                                break;
                            if (!(message.explicitBounds && message.explicitBounds.length))
                                message.explicitBounds = [];
                            message.explicitBounds.push(reader.double());
                            continue;
                        }
                    case 8: {
                            if (wireType !== 2)
                                break;
                            if (!(message.exemplars && message.exemplars.length))
                                message.exemplars = [];
                            message.exemplars.push($root.outray.otlp.Exemplar.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 10: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.uint32())
                                message.flags = value;
                            else
                                delete message.flags;
                            continue;
                        }
                    case 11: {
                            if (wireType !== 1)
                                break;
                            message.min = reader.double();
                            message._min = "min";
                            continue;
                        }
                    case 12: {
                            if (wireType !== 1)
                                break;
                            message.max = reader.double();
                            message._max = "max";
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates a HistogramDataPoint message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.HistogramDataPoint
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.HistogramDataPoint} HistogramDataPoint
             */
            HistogramDataPoint.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.HistogramDataPoint)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.HistogramDataPoint: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.HistogramDataPoint();
                if (object.attributes) {
                    if (!$Array.isArray(object.attributes))
                        throw $TypeError(".outray.otlp.HistogramDataPoint.attributes: array expected");
                    message.attributes = $Array(object.attributes.length);
                    for (let i = 0; i < object.attributes.length; ++i) {
                        if (!$util.isObject(object.attributes[i]))
                            throw $TypeError(".outray.otlp.HistogramDataPoint.attributes: object expected");
                        message.attributes[i] = $root.outray.otlp.KeyValue.fromObject(object.attributes[i], _depth + 1);
                    }
                }
                if (object.startTimeUnixNano != null)
                    if (typeof object.startTimeUnixNano === "object" ? object.startTimeUnixNano.low || object.startTimeUnixNano.high : $Number(object.startTimeUnixNano) !== 0)
                        if ($util.Long)
                            message.startTimeUnixNano = $util.Long.fromValue(object.startTimeUnixNano, true);
                        else if (typeof object.startTimeUnixNano === "string")
                            message.startTimeUnixNano = $parseInt(object.startTimeUnixNano, 10);
                        else if (typeof object.startTimeUnixNano === "number")
                            message.startTimeUnixNano = object.startTimeUnixNano;
                        else if (typeof object.startTimeUnixNano === "object")
                            message.startTimeUnixNano = new $util.LongBits(object.startTimeUnixNano.low >>> 0, object.startTimeUnixNano.high >>> 0).toNumber(true);
                if (object.timeUnixNano != null)
                    if (typeof object.timeUnixNano === "object" ? object.timeUnixNano.low || object.timeUnixNano.high : $Number(object.timeUnixNano) !== 0)
                        if ($util.Long)
                            message.timeUnixNano = $util.Long.fromValue(object.timeUnixNano, true);
                        else if (typeof object.timeUnixNano === "string")
                            message.timeUnixNano = $parseInt(object.timeUnixNano, 10);
                        else if (typeof object.timeUnixNano === "number")
                            message.timeUnixNano = object.timeUnixNano;
                        else if (typeof object.timeUnixNano === "object")
                            message.timeUnixNano = new $util.LongBits(object.timeUnixNano.low >>> 0, object.timeUnixNano.high >>> 0).toNumber(true);
                if (object.count != null)
                    if (typeof object.count === "object" ? object.count.low || object.count.high : $Number(object.count) !== 0)
                        if ($util.Long)
                            message.count = $util.Long.fromValue(object.count, true);
                        else if (typeof object.count === "string")
                            message.count = $parseInt(object.count, 10);
                        else if (typeof object.count === "number")
                            message.count = object.count;
                        else if (typeof object.count === "object")
                            message.count = new $util.LongBits(object.count.low >>> 0, object.count.high >>> 0).toNumber(true);
                if (object.sum != null)
                    message.sum = $Number(object.sum);
                if (object.bucketCounts) {
                    if (!$Array.isArray(object.bucketCounts))
                        throw $TypeError(".outray.otlp.HistogramDataPoint.bucketCounts: array expected");
                    message.bucketCounts = $Array(object.bucketCounts.length);
                    for (let i = 0; i < object.bucketCounts.length; ++i)
                        if ($util.Long)
                            message.bucketCounts[i] = $util.Long.fromValue(object.bucketCounts[i], true);
                        else if (typeof object.bucketCounts[i] === "string")
                            message.bucketCounts[i] = $parseInt(object.bucketCounts[i], 10);
                        else if (typeof object.bucketCounts[i] === "number")
                            message.bucketCounts[i] = object.bucketCounts[i];
                        else if (typeof object.bucketCounts[i] === "object")
                            message.bucketCounts[i] = new $util.LongBits(object.bucketCounts[i].low >>> 0, object.bucketCounts[i].high >>> 0).toNumber(true);
                }
                if (object.explicitBounds) {
                    if (!$Array.isArray(object.explicitBounds))
                        throw $TypeError(".outray.otlp.HistogramDataPoint.explicitBounds: array expected");
                    message.explicitBounds = $Array(object.explicitBounds.length);
                    for (let i = 0; i < object.explicitBounds.length; ++i)
                        message.explicitBounds[i] = $Number(object.explicitBounds[i]);
                }
                if (object.exemplars) {
                    if (!$Array.isArray(object.exemplars))
                        throw $TypeError(".outray.otlp.HistogramDataPoint.exemplars: array expected");
                    message.exemplars = $Array(object.exemplars.length);
                    for (let i = 0; i < object.exemplars.length; ++i) {
                        if (!$util.isObject(object.exemplars[i]))
                            throw $TypeError(".outray.otlp.HistogramDataPoint.exemplars: object expected");
                        message.exemplars[i] = $root.outray.otlp.Exemplar.fromObject(object.exemplars[i], _depth + 1);
                    }
                }
                if (object.flags != null)
                    if ($Number(object.flags) !== 0)
                        message.flags = object.flags >>> 0;
                if (object.min != null)
                    message.min = $Number(object.min);
                if (object.max != null)
                    message.max = $Number(object.max);
                return message;
            };

            /**
             * Creates a plain object from a HistogramDataPoint message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.HistogramDataPoint
             * @static
             * @param {outray.otlp.HistogramDataPoint} message HistogramDataPoint
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            HistogramDataPoint.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults) {
                    object.bucketCounts = [];
                    object.explicitBounds = [];
                    object.exemplars = [];
                    object.attributes = [];
                }
                if (options.defaults) {
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, true);
                        object.startTimeUnixNano = options.longs === $String ? long.toString() : options.longs === $Number ? long.toNumber() : typeof $BigInt !== "undefined" && options.longs === $BigInt ? long.toBigInt() : long;
                    } else
                        object.startTimeUnixNano = options.longs === $String ? "0" : typeof $BigInt !== "undefined" && options.longs === $BigInt ? $BigInt("0") : 0;
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, true);
                        object.timeUnixNano = options.longs === $String ? long.toString() : options.longs === $Number ? long.toNumber() : typeof $BigInt !== "undefined" && options.longs === $BigInt ? long.toBigInt() : long;
                    } else
                        object.timeUnixNano = options.longs === $String ? "0" : typeof $BigInt !== "undefined" && options.longs === $BigInt ? $BigInt("0") : 0;
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, true);
                        object.count = options.longs === $String ? long.toString() : options.longs === $Number ? long.toNumber() : typeof $BigInt !== "undefined" && options.longs === $BigInt ? long.toBigInt() : long;
                    } else
                        object.count = options.longs === $String ? "0" : typeof $BigInt !== "undefined" && options.longs === $BigInt ? $BigInt("0") : 0;
                    object.flags = 0;
                }
                if (message.startTimeUnixNano != null && $Object.hasOwnProperty.call(message, "startTimeUnixNano"))
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.startTimeUnixNano = typeof message.startTimeUnixNano === "number" ? $BigInt(message.startTimeUnixNano) : $util.Long.fromBits(message.startTimeUnixNano.low >>> 0, message.startTimeUnixNano.high >>> 0, true).toBigInt();
                    else if (typeof message.startTimeUnixNano === "number")
                        object.startTimeUnixNano = options.longs === $String ? $String(message.startTimeUnixNano) : message.startTimeUnixNano;
                    else
                        object.startTimeUnixNano = options.longs === $String ? $util.Long.prototype.toString.call(message.startTimeUnixNano) : options.longs === $Number ? new $util.LongBits(message.startTimeUnixNano.low >>> 0, message.startTimeUnixNano.high >>> 0).toNumber(true) : message.startTimeUnixNano;
                if (message.timeUnixNano != null && $Object.hasOwnProperty.call(message, "timeUnixNano"))
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.timeUnixNano = typeof message.timeUnixNano === "number" ? $BigInt(message.timeUnixNano) : $util.Long.fromBits(message.timeUnixNano.low >>> 0, message.timeUnixNano.high >>> 0, true).toBigInt();
                    else if (typeof message.timeUnixNano === "number")
                        object.timeUnixNano = options.longs === $String ? $String(message.timeUnixNano) : message.timeUnixNano;
                    else
                        object.timeUnixNano = options.longs === $String ? $util.Long.prototype.toString.call(message.timeUnixNano) : options.longs === $Number ? new $util.LongBits(message.timeUnixNano.low >>> 0, message.timeUnixNano.high >>> 0).toNumber(true) : message.timeUnixNano;
                if (message.count != null && $Object.hasOwnProperty.call(message, "count"))
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.count = typeof message.count === "number" ? $BigInt(message.count) : $util.Long.fromBits(message.count.low >>> 0, message.count.high >>> 0, true).toBigInt();
                    else if (typeof message.count === "number")
                        object.count = options.longs === $String ? $String(message.count) : message.count;
                    else
                        object.count = options.longs === $String ? $util.Long.prototype.toString.call(message.count) : options.longs === $Number ? new $util.LongBits(message.count.low >>> 0, message.count.high >>> 0).toNumber(true) : message.count;
                if (message.sum != null && $Object.hasOwnProperty.call(message, "sum"))
                    object.sum = options.json && !$isFinite(message.sum) ? $String(message.sum) : message.sum;
                if (message.bucketCounts && message.bucketCounts.length) {
                    object.bucketCounts = $Array(message.bucketCounts.length);
                    for (let j = 0; j < message.bucketCounts.length; ++j)
                        if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                            object.bucketCounts[j] = typeof message.bucketCounts[j] === "number" ? $BigInt(message.bucketCounts[j]) : $util.Long.fromBits(message.bucketCounts[j].low >>> 0, message.bucketCounts[j].high >>> 0, true).toBigInt();
                        else if (typeof message.bucketCounts[j] === "number")
                            object.bucketCounts[j] = options.longs === $String ? $String(message.bucketCounts[j]) : message.bucketCounts[j];
                        else
                            object.bucketCounts[j] = options.longs === $String ? $util.Long.prototype.toString.call(message.bucketCounts[j]) : options.longs === $Number ? new $util.LongBits(message.bucketCounts[j].low >>> 0, message.bucketCounts[j].high >>> 0).toNumber(true) : message.bucketCounts[j];
                }
                if (message.explicitBounds && message.explicitBounds.length) {
                    object.explicitBounds = $Array(message.explicitBounds.length);
                    for (let j = 0; j < message.explicitBounds.length; ++j)
                        object.explicitBounds[j] = options.json && !$isFinite(message.explicitBounds[j]) ? $String(message.explicitBounds[j]) : message.explicitBounds[j];
                }
                if (message.exemplars && message.exemplars.length) {
                    object.exemplars = $Array(message.exemplars.length);
                    for (let j = 0; j < message.exemplars.length; ++j)
                        object.exemplars[j] = $root.outray.otlp.Exemplar.toObject(message.exemplars[j], options, _depth + 1);
                }
                if (message.attributes && message.attributes.length) {
                    object.attributes = $Array(message.attributes.length);
                    for (let j = 0; j < message.attributes.length; ++j)
                        object.attributes[j] = $root.outray.otlp.KeyValue.toObject(message.attributes[j], options, _depth + 1);
                }
                if (message.flags != null && $Object.hasOwnProperty.call(message, "flags"))
                    object.flags = message.flags;
                if (message.min != null && $Object.hasOwnProperty.call(message, "min"))
                    object.min = options.json && !$isFinite(message.min) ? $String(message.min) : message.min;
                if (message.max != null && $Object.hasOwnProperty.call(message, "max"))
                    object.max = options.json && !$isFinite(message.max) ? $String(message.max) : message.max;
                return object;
            };

            /**
             * Converts this HistogramDataPoint to JSON.
             * @function toJSON
             * @memberof outray.otlp.HistogramDataPoint
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            HistogramDataPoint.prototype.toJSON = function() {
                return HistogramDataPoint.toObject(this, $protobuf.util.toJSONOptions);
            };

            return HistogramDataPoint;
        })();

        otlp.ExponentialHistogramDataPoint = (function() {

            /**
             * Properties of an ExponentialHistogramDataPoint.
             * @typedef {Object} outray.otlp.ExponentialHistogramDataPoint.$Properties
             * @property {Array.<outray.otlp.KeyValue.$Properties>|null} [attributes] ExponentialHistogramDataPoint attributes
             * @property {number|Long|null} [startTimeUnixNano] ExponentialHistogramDataPoint startTimeUnixNano
             * @property {number|Long|null} [timeUnixNano] ExponentialHistogramDataPoint timeUnixNano
             * @property {number|Long|null} [count] ExponentialHistogramDataPoint count
             * @property {number|null} [sum] ExponentialHistogramDataPoint sum
             * @property {number|null} [scale] ExponentialHistogramDataPoint scale
             * @property {number|Long|null} [zeroCount] ExponentialHistogramDataPoint zeroCount
             * @property {outray.otlp.ExponentialHistogramDataPoint.Buckets.$Properties|null} [positive] ExponentialHistogramDataPoint positive
             * @property {outray.otlp.ExponentialHistogramDataPoint.Buckets.$Properties|null} [negative] ExponentialHistogramDataPoint negative
             * @property {number|null} [flags] ExponentialHistogramDataPoint flags
             * @property {Array.<outray.otlp.Exemplar.$Properties>|null} [exemplars] ExponentialHistogramDataPoint exemplars
             * @property {number|null} [min] ExponentialHistogramDataPoint min
             * @property {number|null} [max] ExponentialHistogramDataPoint max
             * @property {number|null} [zeroThreshold] ExponentialHistogramDataPoint zeroThreshold
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of an ExponentialHistogramDataPoint.
             * @memberof outray.otlp
             * @interface IExponentialHistogramDataPoint
             * @augments outray.otlp.ExponentialHistogramDataPoint.$Properties
             * @deprecated Use outray.otlp.ExponentialHistogramDataPoint.$Properties instead.
             */

            /**
             * Shape of an ExponentialHistogramDataPoint.
             * @typedef {{
             *   attributes?: Array.<outray.otlp.KeyValue.$Shape>|null;
             *   startTimeUnixNano?: number|Long|null;
             *   timeUnixNano?: number|Long|null;
             *   count?: number|Long|null;
             *   sum?: number|null;
             *   scale?: number|null;
             *   zeroCount?: number|Long|null;
             *   positive?: outray.otlp.ExponentialHistogramDataPoint.Buckets.$Shape|null;
             *   negative?: outray.otlp.ExponentialHistogramDataPoint.Buckets.$Shape|null;
             *   flags?: number|null;
             *   exemplars?: Array.<outray.otlp.Exemplar.$Shape>|null;
             *   min?: number|null;
             *   max?: number|null;
             *   zeroThreshold?: number|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.ExponentialHistogramDataPoint.$Shape
             */

            /**
             * Constructs a new ExponentialHistogramDataPoint.
             * @memberof outray.otlp
             * @classdesc Represents an ExponentialHistogramDataPoint.
             * @constructor
             * @param {outray.otlp.ExponentialHistogramDataPoint.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const ExponentialHistogramDataPoint = function (properties) {
                this.attributes = [];
                this.exemplars = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * ExponentialHistogramDataPoint attributes.
             * @member {Array.<outray.otlp.KeyValue.$Properties>} attributes
             * @memberof outray.otlp.ExponentialHistogramDataPoint
             * @instance
             */
            ExponentialHistogramDataPoint.prototype.attributes = $util.emptyArray;

            /**
             * ExponentialHistogramDataPoint startTimeUnixNano.
             * @member {number|Long} startTimeUnixNano
             * @memberof outray.otlp.ExponentialHistogramDataPoint
             * @instance
             */
            ExponentialHistogramDataPoint.prototype.startTimeUnixNano = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * ExponentialHistogramDataPoint timeUnixNano.
             * @member {number|Long} timeUnixNano
             * @memberof outray.otlp.ExponentialHistogramDataPoint
             * @instance
             */
            ExponentialHistogramDataPoint.prototype.timeUnixNano = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * ExponentialHistogramDataPoint count.
             * @member {number|Long} count
             * @memberof outray.otlp.ExponentialHistogramDataPoint
             * @instance
             */
            ExponentialHistogramDataPoint.prototype.count = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * ExponentialHistogramDataPoint sum.
             * @member {number|null|undefined} sum
             * @memberof outray.otlp.ExponentialHistogramDataPoint
             * @instance
             */
            ExponentialHistogramDataPoint.prototype.sum = null;

            /**
             * ExponentialHistogramDataPoint scale.
             * @member {number} scale
             * @memberof outray.otlp.ExponentialHistogramDataPoint
             * @instance
             */
            ExponentialHistogramDataPoint.prototype.scale = 0;

            /**
             * ExponentialHistogramDataPoint zeroCount.
             * @member {number|Long} zeroCount
             * @memberof outray.otlp.ExponentialHistogramDataPoint
             * @instance
             */
            ExponentialHistogramDataPoint.prototype.zeroCount = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * ExponentialHistogramDataPoint positive.
             * @member {outray.otlp.ExponentialHistogramDataPoint.Buckets.$Properties|null|undefined} positive
             * @memberof outray.otlp.ExponentialHistogramDataPoint
             * @instance
             */
            ExponentialHistogramDataPoint.prototype.positive = null;

            /**
             * ExponentialHistogramDataPoint negative.
             * @member {outray.otlp.ExponentialHistogramDataPoint.Buckets.$Properties|null|undefined} negative
             * @memberof outray.otlp.ExponentialHistogramDataPoint
             * @instance
             */
            ExponentialHistogramDataPoint.prototype.negative = null;

            /**
             * ExponentialHistogramDataPoint flags.
             * @member {number} flags
             * @memberof outray.otlp.ExponentialHistogramDataPoint
             * @instance
             */
            ExponentialHistogramDataPoint.prototype.flags = 0;

            /**
             * ExponentialHistogramDataPoint exemplars.
             * @member {Array.<outray.otlp.Exemplar.$Properties>} exemplars
             * @memberof outray.otlp.ExponentialHistogramDataPoint
             * @instance
             */
            ExponentialHistogramDataPoint.prototype.exemplars = $util.emptyArray;

            /**
             * ExponentialHistogramDataPoint min.
             * @member {number|null|undefined} min
             * @memberof outray.otlp.ExponentialHistogramDataPoint
             * @instance
             */
            ExponentialHistogramDataPoint.prototype.min = null;

            /**
             * ExponentialHistogramDataPoint max.
             * @member {number|null|undefined} max
             * @memberof outray.otlp.ExponentialHistogramDataPoint
             * @instance
             */
            ExponentialHistogramDataPoint.prototype.max = null;

            /**
             * ExponentialHistogramDataPoint zeroThreshold.
             * @member {number} zeroThreshold
             * @memberof outray.otlp.ExponentialHistogramDataPoint
             * @instance
             */
            ExponentialHistogramDataPoint.prototype.zeroThreshold = 0;

            // OneOf field names bound to virtual getters and setters
            let $oneOfFields;

            // Virtual OneOf for proto3 optional field
            $Object.defineProperty(ExponentialHistogramDataPoint.prototype, "_sum", {
                get: $util.oneOfGetter($oneOfFields = ["sum"]),
                set: $util.oneOfSetter($oneOfFields)
            });

            // Virtual OneOf for proto3 optional field
            $Object.defineProperty(ExponentialHistogramDataPoint.prototype, "_min", {
                get: $util.oneOfGetter($oneOfFields = ["min"]),
                set: $util.oneOfSetter($oneOfFields)
            });

            // Virtual OneOf for proto3 optional field
            $Object.defineProperty(ExponentialHistogramDataPoint.prototype, "_max", {
                get: $util.oneOfGetter($oneOfFields = ["max"]),
                set: $util.oneOfSetter($oneOfFields)
            });

            /**
             * Creates a new ExponentialHistogramDataPoint instance using the specified properties.
             * @function create
             * @memberof outray.otlp.ExponentialHistogramDataPoint
             * @static
             * @param {outray.otlp.ExponentialHistogramDataPoint.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.ExponentialHistogramDataPoint} ExponentialHistogramDataPoint instance
             * @type {{
             *   (properties: outray.otlp.ExponentialHistogramDataPoint.$Shape): outray.otlp.ExponentialHistogramDataPoint & outray.otlp.ExponentialHistogramDataPoint.$Shape;
             *   (properties?: outray.otlp.ExponentialHistogramDataPoint.$Properties): outray.otlp.ExponentialHistogramDataPoint;
             * }}
             */
            ExponentialHistogramDataPoint.create = function(properties) {
                return new ExponentialHistogramDataPoint(properties);
            };

            /**
             * Encodes the specified ExponentialHistogramDataPoint message. Does not implicitly {@link outray.otlp.ExponentialHistogramDataPoint.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.ExponentialHistogramDataPoint
             * @static
             * @param {outray.otlp.ExponentialHistogramDataPoint.$Properties} message ExponentialHistogramDataPoint message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ExponentialHistogramDataPoint.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.attributes != null && message.attributes.length)
                    for (let i = 0; i < message.attributes.length; ++i)
                        $root.outray.otlp.KeyValue.encode(message.attributes[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
                if (message.startTimeUnixNano != null && $Object.hasOwnProperty.call(message, "startTimeUnixNano") && (typeof message.startTimeUnixNano === "object" ? message.startTimeUnixNano.low || message.startTimeUnixNano.high : message.startTimeUnixNano !== 0))
                    writer.uint32(/* id 2, wireType 1 =*/17).fixed64(message.startTimeUnixNano);
                if (message.timeUnixNano != null && $Object.hasOwnProperty.call(message, "timeUnixNano") && (typeof message.timeUnixNano === "object" ? message.timeUnixNano.low || message.timeUnixNano.high : message.timeUnixNano !== 0))
                    writer.uint32(/* id 3, wireType 1 =*/25).fixed64(message.timeUnixNano);
                if (message.count != null && $Object.hasOwnProperty.call(message, "count") && (typeof message.count === "object" ? message.count.low || message.count.high : message.count !== 0))
                    writer.uint32(/* id 4, wireType 1 =*/33).fixed64(message.count);
                if (message.sum != null && $Object.hasOwnProperty.call(message, "sum"))
                    writer.uint32(/* id 5, wireType 1 =*/41).double(message.sum);
                if (message.scale != null && $Object.hasOwnProperty.call(message, "scale") && message.scale !== 0)
                    writer.uint32(/* id 6, wireType 0 =*/48).sint32(message.scale);
                if (message.zeroCount != null && $Object.hasOwnProperty.call(message, "zeroCount") && (typeof message.zeroCount === "object" ? message.zeroCount.low || message.zeroCount.high : message.zeroCount !== 0))
                    writer.uint32(/* id 7, wireType 1 =*/57).fixed64(message.zeroCount);
                if (message.positive != null && $Object.hasOwnProperty.call(message, "positive"))
                    $root.outray.otlp.ExponentialHistogramDataPoint.Buckets.encode(message.positive, writer.uint32(/* id 8, wireType 2 =*/66).fork(), _depth + 1).ldelim();
                if (message.negative != null && $Object.hasOwnProperty.call(message, "negative"))
                    $root.outray.otlp.ExponentialHistogramDataPoint.Buckets.encode(message.negative, writer.uint32(/* id 9, wireType 2 =*/74).fork(), _depth + 1).ldelim();
                if (message.flags != null && $Object.hasOwnProperty.call(message, "flags") && message.flags !== 0)
                    writer.uint32(/* id 10, wireType 0 =*/80).uint32(message.flags);
                if (message.exemplars != null && message.exemplars.length)
                    for (let i = 0; i < message.exemplars.length; ++i)
                        $root.outray.otlp.Exemplar.encode(message.exemplars[i], writer.uint32(/* id 11, wireType 2 =*/90).fork(), _depth + 1).ldelim();
                if (message.min != null && $Object.hasOwnProperty.call(message, "min"))
                    writer.uint32(/* id 12, wireType 1 =*/97).double(message.min);
                if (message.max != null && $Object.hasOwnProperty.call(message, "max"))
                    writer.uint32(/* id 13, wireType 1 =*/105).double(message.max);
                if (message.zeroThreshold != null && $Object.hasOwnProperty.call(message, "zeroThreshold") && !$Object.is(message.zeroThreshold, 0))
                    writer.uint32(/* id 14, wireType 1 =*/113).double(message.zeroThreshold);
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes an ExponentialHistogramDataPoint message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.ExponentialHistogramDataPoint
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.ExponentialHistogramDataPoint & outray.otlp.ExponentialHistogramDataPoint.$Shape} ExponentialHistogramDataPoint
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ExponentialHistogramDataPoint.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.ExponentialHistogramDataPoint();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            if (!(message.attributes && message.attributes.length))
                                message.attributes = [];
                            message.attributes.push($root.outray.otlp.KeyValue.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 2: {
                            if (wireType !== 1)
                                break;
                            if (typeof (value = reader.fixed64()) === "object" ? value.low || value.high : value !== 0)
                                message.startTimeUnixNano = value;
                            else
                                delete message.startTimeUnixNano;
                            continue;
                        }
                    case 3: {
                            if (wireType !== 1)
                                break;
                            if (typeof (value = reader.fixed64()) === "object" ? value.low || value.high : value !== 0)
                                message.timeUnixNano = value;
                            else
                                delete message.timeUnixNano;
                            continue;
                        }
                    case 4: {
                            if (wireType !== 1)
                                break;
                            if (typeof (value = reader.fixed64()) === "object" ? value.low || value.high : value !== 0)
                                message.count = value;
                            else
                                delete message.count;
                            continue;
                        }
                    case 5: {
                            if (wireType !== 1)
                                break;
                            message.sum = reader.double();
                            message._sum = "sum";
                            continue;
                        }
                    case 6: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.sint32())
                                message.scale = value;
                            else
                                delete message.scale;
                            continue;
                        }
                    case 7: {
                            if (wireType !== 1)
                                break;
                            if (typeof (value = reader.fixed64()) === "object" ? value.low || value.high : value !== 0)
                                message.zeroCount = value;
                            else
                                delete message.zeroCount;
                            continue;
                        }
                    case 8: {
                            if (wireType !== 2)
                                break;
                            message.positive = $root.outray.otlp.ExponentialHistogramDataPoint.Buckets.decode(reader, reader.uint32(), $undefined, _depth + 1, message.positive);
                            continue;
                        }
                    case 9: {
                            if (wireType !== 2)
                                break;
                            message.negative = $root.outray.otlp.ExponentialHistogramDataPoint.Buckets.decode(reader, reader.uint32(), $undefined, _depth + 1, message.negative);
                            continue;
                        }
                    case 10: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.uint32())
                                message.flags = value;
                            else
                                delete message.flags;
                            continue;
                        }
                    case 11: {
                            if (wireType !== 2)
                                break;
                            if (!(message.exemplars && message.exemplars.length))
                                message.exemplars = [];
                            message.exemplars.push($root.outray.otlp.Exemplar.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 12: {
                            if (wireType !== 1)
                                break;
                            message.min = reader.double();
                            message._min = "min";
                            continue;
                        }
                    case 13: {
                            if (wireType !== 1)
                                break;
                            message.max = reader.double();
                            message._max = "max";
                            continue;
                        }
                    case 14: {
                            if (wireType !== 1)
                                break;
                            if (!$Object.is(value = reader.double(), 0))
                                message.zeroThreshold = value;
                            else
                                delete message.zeroThreshold;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates an ExponentialHistogramDataPoint message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.ExponentialHistogramDataPoint
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.ExponentialHistogramDataPoint} ExponentialHistogramDataPoint
             */
            ExponentialHistogramDataPoint.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.ExponentialHistogramDataPoint)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.ExponentialHistogramDataPoint: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.ExponentialHistogramDataPoint();
                if (object.attributes) {
                    if (!$Array.isArray(object.attributes))
                        throw $TypeError(".outray.otlp.ExponentialHistogramDataPoint.attributes: array expected");
                    message.attributes = $Array(object.attributes.length);
                    for (let i = 0; i < object.attributes.length; ++i) {
                        if (!$util.isObject(object.attributes[i]))
                            throw $TypeError(".outray.otlp.ExponentialHistogramDataPoint.attributes: object expected");
                        message.attributes[i] = $root.outray.otlp.KeyValue.fromObject(object.attributes[i], _depth + 1);
                    }
                }
                if (object.startTimeUnixNano != null)
                    if (typeof object.startTimeUnixNano === "object" ? object.startTimeUnixNano.low || object.startTimeUnixNano.high : $Number(object.startTimeUnixNano) !== 0)
                        if ($util.Long)
                            message.startTimeUnixNano = $util.Long.fromValue(object.startTimeUnixNano, true);
                        else if (typeof object.startTimeUnixNano === "string")
                            message.startTimeUnixNano = $parseInt(object.startTimeUnixNano, 10);
                        else if (typeof object.startTimeUnixNano === "number")
                            message.startTimeUnixNano = object.startTimeUnixNano;
                        else if (typeof object.startTimeUnixNano === "object")
                            message.startTimeUnixNano = new $util.LongBits(object.startTimeUnixNano.low >>> 0, object.startTimeUnixNano.high >>> 0).toNumber(true);
                if (object.timeUnixNano != null)
                    if (typeof object.timeUnixNano === "object" ? object.timeUnixNano.low || object.timeUnixNano.high : $Number(object.timeUnixNano) !== 0)
                        if ($util.Long)
                            message.timeUnixNano = $util.Long.fromValue(object.timeUnixNano, true);
                        else if (typeof object.timeUnixNano === "string")
                            message.timeUnixNano = $parseInt(object.timeUnixNano, 10);
                        else if (typeof object.timeUnixNano === "number")
                            message.timeUnixNano = object.timeUnixNano;
                        else if (typeof object.timeUnixNano === "object")
                            message.timeUnixNano = new $util.LongBits(object.timeUnixNano.low >>> 0, object.timeUnixNano.high >>> 0).toNumber(true);
                if (object.count != null)
                    if (typeof object.count === "object" ? object.count.low || object.count.high : $Number(object.count) !== 0)
                        if ($util.Long)
                            message.count = $util.Long.fromValue(object.count, true);
                        else if (typeof object.count === "string")
                            message.count = $parseInt(object.count, 10);
                        else if (typeof object.count === "number")
                            message.count = object.count;
                        else if (typeof object.count === "object")
                            message.count = new $util.LongBits(object.count.low >>> 0, object.count.high >>> 0).toNumber(true);
                if (object.sum != null)
                    message.sum = $Number(object.sum);
                if (object.scale != null)
                    if ($Number(object.scale) !== 0)
                        message.scale = object.scale | 0;
                if (object.zeroCount != null)
                    if (typeof object.zeroCount === "object" ? object.zeroCount.low || object.zeroCount.high : $Number(object.zeroCount) !== 0)
                        if ($util.Long)
                            message.zeroCount = $util.Long.fromValue(object.zeroCount, true);
                        else if (typeof object.zeroCount === "string")
                            message.zeroCount = $parseInt(object.zeroCount, 10);
                        else if (typeof object.zeroCount === "number")
                            message.zeroCount = object.zeroCount;
                        else if (typeof object.zeroCount === "object")
                            message.zeroCount = new $util.LongBits(object.zeroCount.low >>> 0, object.zeroCount.high >>> 0).toNumber(true);
                if (object.positive != null) {
                    if (!$util.isObject(object.positive))
                        throw $TypeError(".outray.otlp.ExponentialHistogramDataPoint.positive: object expected");
                    message.positive = $root.outray.otlp.ExponentialHistogramDataPoint.Buckets.fromObject(object.positive, _depth + 1);
                }
                if (object.negative != null) {
                    if (!$util.isObject(object.negative))
                        throw $TypeError(".outray.otlp.ExponentialHistogramDataPoint.negative: object expected");
                    message.negative = $root.outray.otlp.ExponentialHistogramDataPoint.Buckets.fromObject(object.negative, _depth + 1);
                }
                if (object.flags != null)
                    if ($Number(object.flags) !== 0)
                        message.flags = object.flags >>> 0;
                if (object.exemplars) {
                    if (!$Array.isArray(object.exemplars))
                        throw $TypeError(".outray.otlp.ExponentialHistogramDataPoint.exemplars: array expected");
                    message.exemplars = $Array(object.exemplars.length);
                    for (let i = 0; i < object.exemplars.length; ++i) {
                        if (!$util.isObject(object.exemplars[i]))
                            throw $TypeError(".outray.otlp.ExponentialHistogramDataPoint.exemplars: object expected");
                        message.exemplars[i] = $root.outray.otlp.Exemplar.fromObject(object.exemplars[i], _depth + 1);
                    }
                }
                if (object.min != null)
                    message.min = $Number(object.min);
                if (object.max != null)
                    message.max = $Number(object.max);
                if (object.zeroThreshold != null)
                    if (!$Object.is($Number(object.zeroThreshold), 0))
                        message.zeroThreshold = $Number(object.zeroThreshold);
                return message;
            };

            /**
             * Creates a plain object from an ExponentialHistogramDataPoint message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.ExponentialHistogramDataPoint
             * @static
             * @param {outray.otlp.ExponentialHistogramDataPoint} message ExponentialHistogramDataPoint
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ExponentialHistogramDataPoint.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults) {
                    object.attributes = [];
                    object.exemplars = [];
                }
                if (options.defaults) {
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, true);
                        object.startTimeUnixNano = options.longs === $String ? long.toString() : options.longs === $Number ? long.toNumber() : typeof $BigInt !== "undefined" && options.longs === $BigInt ? long.toBigInt() : long;
                    } else
                        object.startTimeUnixNano = options.longs === $String ? "0" : typeof $BigInt !== "undefined" && options.longs === $BigInt ? $BigInt("0") : 0;
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, true);
                        object.timeUnixNano = options.longs === $String ? long.toString() : options.longs === $Number ? long.toNumber() : typeof $BigInt !== "undefined" && options.longs === $BigInt ? long.toBigInt() : long;
                    } else
                        object.timeUnixNano = options.longs === $String ? "0" : typeof $BigInt !== "undefined" && options.longs === $BigInt ? $BigInt("0") : 0;
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, true);
                        object.count = options.longs === $String ? long.toString() : options.longs === $Number ? long.toNumber() : typeof $BigInt !== "undefined" && options.longs === $BigInt ? long.toBigInt() : long;
                    } else
                        object.count = options.longs === $String ? "0" : typeof $BigInt !== "undefined" && options.longs === $BigInt ? $BigInt("0") : 0;
                    object.scale = 0;
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, true);
                        object.zeroCount = options.longs === $String ? long.toString() : options.longs === $Number ? long.toNumber() : typeof $BigInt !== "undefined" && options.longs === $BigInt ? long.toBigInt() : long;
                    } else
                        object.zeroCount = options.longs === $String ? "0" : typeof $BigInt !== "undefined" && options.longs === $BigInt ? $BigInt("0") : 0;
                    object.positive = null;
                    object.negative = null;
                    object.flags = 0;
                    object.zeroThreshold = 0;
                }
                if (message.attributes && message.attributes.length) {
                    object.attributes = $Array(message.attributes.length);
                    for (let j = 0; j < message.attributes.length; ++j)
                        object.attributes[j] = $root.outray.otlp.KeyValue.toObject(message.attributes[j], options, _depth + 1);
                }
                if (message.startTimeUnixNano != null && $Object.hasOwnProperty.call(message, "startTimeUnixNano"))
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.startTimeUnixNano = typeof message.startTimeUnixNano === "number" ? $BigInt(message.startTimeUnixNano) : $util.Long.fromBits(message.startTimeUnixNano.low >>> 0, message.startTimeUnixNano.high >>> 0, true).toBigInt();
                    else if (typeof message.startTimeUnixNano === "number")
                        object.startTimeUnixNano = options.longs === $String ? $String(message.startTimeUnixNano) : message.startTimeUnixNano;
                    else
                        object.startTimeUnixNano = options.longs === $String ? $util.Long.prototype.toString.call(message.startTimeUnixNano) : options.longs === $Number ? new $util.LongBits(message.startTimeUnixNano.low >>> 0, message.startTimeUnixNano.high >>> 0).toNumber(true) : message.startTimeUnixNano;
                if (message.timeUnixNano != null && $Object.hasOwnProperty.call(message, "timeUnixNano"))
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.timeUnixNano = typeof message.timeUnixNano === "number" ? $BigInt(message.timeUnixNano) : $util.Long.fromBits(message.timeUnixNano.low >>> 0, message.timeUnixNano.high >>> 0, true).toBigInt();
                    else if (typeof message.timeUnixNano === "number")
                        object.timeUnixNano = options.longs === $String ? $String(message.timeUnixNano) : message.timeUnixNano;
                    else
                        object.timeUnixNano = options.longs === $String ? $util.Long.prototype.toString.call(message.timeUnixNano) : options.longs === $Number ? new $util.LongBits(message.timeUnixNano.low >>> 0, message.timeUnixNano.high >>> 0).toNumber(true) : message.timeUnixNano;
                if (message.count != null && $Object.hasOwnProperty.call(message, "count"))
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.count = typeof message.count === "number" ? $BigInt(message.count) : $util.Long.fromBits(message.count.low >>> 0, message.count.high >>> 0, true).toBigInt();
                    else if (typeof message.count === "number")
                        object.count = options.longs === $String ? $String(message.count) : message.count;
                    else
                        object.count = options.longs === $String ? $util.Long.prototype.toString.call(message.count) : options.longs === $Number ? new $util.LongBits(message.count.low >>> 0, message.count.high >>> 0).toNumber(true) : message.count;
                if (message.sum != null && $Object.hasOwnProperty.call(message, "sum"))
                    object.sum = options.json && !$isFinite(message.sum) ? $String(message.sum) : message.sum;
                if (message.scale != null && $Object.hasOwnProperty.call(message, "scale"))
                    object.scale = message.scale;
                if (message.zeroCount != null && $Object.hasOwnProperty.call(message, "zeroCount"))
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.zeroCount = typeof message.zeroCount === "number" ? $BigInt(message.zeroCount) : $util.Long.fromBits(message.zeroCount.low >>> 0, message.zeroCount.high >>> 0, true).toBigInt();
                    else if (typeof message.zeroCount === "number")
                        object.zeroCount = options.longs === $String ? $String(message.zeroCount) : message.zeroCount;
                    else
                        object.zeroCount = options.longs === $String ? $util.Long.prototype.toString.call(message.zeroCount) : options.longs === $Number ? new $util.LongBits(message.zeroCount.low >>> 0, message.zeroCount.high >>> 0).toNumber(true) : message.zeroCount;
                if (message.positive != null && $Object.hasOwnProperty.call(message, "positive"))
                    object.positive = $root.outray.otlp.ExponentialHistogramDataPoint.Buckets.toObject(message.positive, options, _depth + 1);
                if (message.negative != null && $Object.hasOwnProperty.call(message, "negative"))
                    object.negative = $root.outray.otlp.ExponentialHistogramDataPoint.Buckets.toObject(message.negative, options, _depth + 1);
                if (message.flags != null && $Object.hasOwnProperty.call(message, "flags"))
                    object.flags = message.flags;
                if (message.exemplars && message.exemplars.length) {
                    object.exemplars = $Array(message.exemplars.length);
                    for (let j = 0; j < message.exemplars.length; ++j)
                        object.exemplars[j] = $root.outray.otlp.Exemplar.toObject(message.exemplars[j], options, _depth + 1);
                }
                if (message.min != null && $Object.hasOwnProperty.call(message, "min"))
                    object.min = options.json && !$isFinite(message.min) ? $String(message.min) : message.min;
                if (message.max != null && $Object.hasOwnProperty.call(message, "max"))
                    object.max = options.json && !$isFinite(message.max) ? $String(message.max) : message.max;
                if (message.zeroThreshold != null && $Object.hasOwnProperty.call(message, "zeroThreshold"))
                    object.zeroThreshold = options.json && !$isFinite(message.zeroThreshold) ? $String(message.zeroThreshold) : message.zeroThreshold;
                return object;
            };

            /**
             * Converts this ExponentialHistogramDataPoint to JSON.
             * @function toJSON
             * @memberof outray.otlp.ExponentialHistogramDataPoint
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ExponentialHistogramDataPoint.prototype.toJSON = function() {
                return ExponentialHistogramDataPoint.toObject(this, $protobuf.util.toJSONOptions);
            };

            ExponentialHistogramDataPoint.Buckets = (function() {

                /**
                 * Properties of a Buckets.
                 * @typedef {Object} outray.otlp.ExponentialHistogramDataPoint.Buckets.$Properties
                 * @property {number|null} [offset] Buckets offset
                 * @property {Array.<number|Long>|null} [bucketCounts] Buckets bucketCounts
                 * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
                 */

                /**
                 * Properties of a Buckets.
                 * @memberof outray.otlp.ExponentialHistogramDataPoint
                 * @interface IBuckets
                 * @augments outray.otlp.ExponentialHistogramDataPoint.Buckets.$Properties
                 * @deprecated Use outray.otlp.ExponentialHistogramDataPoint.Buckets.$Properties instead.
                 */

                /**
                 * Shape of a Buckets.
                 * @typedef {outray.otlp.ExponentialHistogramDataPoint.Buckets.$Properties} outray.otlp.ExponentialHistogramDataPoint.Buckets.$Shape
                 */

                /**
                 * Constructs a new Buckets.
                 * @memberof outray.otlp.ExponentialHistogramDataPoint
                 * @classdesc Represents a Buckets.
                 * @constructor
                 * @param {outray.otlp.ExponentialHistogramDataPoint.Buckets.$Properties=} [properties] Properties to set
                 * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
                 */
                const Buckets = function (properties) {
                    this.bucketCounts = [];
                    if (properties)
                        for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                /**
                 * Buckets offset.
                 * @member {number} offset
                 * @memberof outray.otlp.ExponentialHistogramDataPoint.Buckets
                 * @instance
                 */
                Buckets.prototype.offset = 0;

                /**
                 * Buckets bucketCounts.
                 * @member {Array.<number|Long>} bucketCounts
                 * @memberof outray.otlp.ExponentialHistogramDataPoint.Buckets
                 * @instance
                 */
                Buckets.prototype.bucketCounts = $util.emptyArray;

                /**
                 * Creates a new Buckets instance using the specified properties.
                 * @function create
                 * @memberof outray.otlp.ExponentialHistogramDataPoint.Buckets
                 * @static
                 * @param {outray.otlp.ExponentialHistogramDataPoint.Buckets.$Properties=} [properties] Properties to set
                 * @returns {outray.otlp.ExponentialHistogramDataPoint.Buckets} Buckets instance
                 * @type {{
                 *   (properties: outray.otlp.ExponentialHistogramDataPoint.Buckets.$Shape): outray.otlp.ExponentialHistogramDataPoint.Buckets & outray.otlp.ExponentialHistogramDataPoint.Buckets.$Shape;
                 *   (properties?: outray.otlp.ExponentialHistogramDataPoint.Buckets.$Properties): outray.otlp.ExponentialHistogramDataPoint.Buckets;
                 * }}
                 */
                Buckets.create = function(properties) {
                    return new Buckets(properties);
                };

                /**
                 * Encodes the specified Buckets message. Does not implicitly {@link outray.otlp.ExponentialHistogramDataPoint.Buckets.verify|verify} messages.
                 * @function encode
                 * @memberof outray.otlp.ExponentialHistogramDataPoint.Buckets
                 * @static
                 * @param {outray.otlp.ExponentialHistogramDataPoint.Buckets.$Properties} message Buckets message or plain object to encode
                 * @param {$protobuf.Writer} [writer] Writer to encode to
                 * @returns {$protobuf.Writer} Writer
                 */
                Buckets.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.offset != null && $Object.hasOwnProperty.call(message, "offset") && message.offset !== 0)
                        writer.uint32(/* id 1, wireType 0 =*/8).sint32(message.offset);
                    if (message.bucketCounts != null && message.bucketCounts.length)
                        writer.uint32(/* id 2, wireType 2 =*/18).uint64s(message.bucketCounts);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (let i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                /**
                 * Decodes a Buckets message from the specified reader or buffer.
                 * @function decode
                 * @memberof outray.otlp.ExponentialHistogramDataPoint.Buckets
                 * @static
                 * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                 * @param {number} [length] Message length if known beforehand
                 * @returns {outray.otlp.ExponentialHistogramDataPoint.Buckets & outray.otlp.ExponentialHistogramDataPoint.Buckets.$Shape} Buckets
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                Buckets.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    let end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.outray.otlp.ExponentialHistogramDataPoint.Buckets();
                    while (reader.pos < end) {
                        let start = reader.pos;
                        let tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        let wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.sint32())
                                    message.offset = value;
                                else
                                    delete message.offset;
                                continue;
                            }
                        case 2: {
                                if (wireType === 2) {
                                    if (!(message.bucketCounts && message.bucketCounts.length))
                                        message.bucketCounts = [];
                                    reader.uint64s(message.bucketCounts);
                                    continue;
                                }
                                if (wireType !== 0)
                                    break;
                                if (!(message.bucketCounts && message.bucketCounts.length))
                                    message.bucketCounts = [];
                                message.bucketCounts.push(reader.uint64());
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                /**
                 * Creates a Buckets message from a plain object. Also converts values to their respective internal types.
                 * @function fromObject
                 * @memberof outray.otlp.ExponentialHistogramDataPoint.Buckets
                 * @static
                 * @param {Object.<string,*>} object Plain object
                 * @returns {outray.otlp.ExponentialHistogramDataPoint.Buckets} Buckets
                 */
                Buckets.fromObject = function (object, _depth) {
                    if (object instanceof $root.outray.otlp.ExponentialHistogramDataPoint.Buckets)
                        return object;
                    if (!$util.isObject(object))
                        throw $TypeError(".outray.otlp.ExponentialHistogramDataPoint.Buckets: object expected");
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    let message = new $root.outray.otlp.ExponentialHistogramDataPoint.Buckets();
                    if (object.offset != null)
                        if ($Number(object.offset) !== 0)
                            message.offset = object.offset | 0;
                    if (object.bucketCounts) {
                        if (!$Array.isArray(object.bucketCounts))
                            throw $TypeError(".outray.otlp.ExponentialHistogramDataPoint.Buckets.bucketCounts: array expected");
                        message.bucketCounts = $Array(object.bucketCounts.length);
                        for (let i = 0; i < object.bucketCounts.length; ++i)
                            if ($util.Long)
                                message.bucketCounts[i] = $util.Long.fromValue(object.bucketCounts[i], true);
                            else if (typeof object.bucketCounts[i] === "string")
                                message.bucketCounts[i] = $parseInt(object.bucketCounts[i], 10);
                            else if (typeof object.bucketCounts[i] === "number")
                                message.bucketCounts[i] = object.bucketCounts[i];
                            else if (typeof object.bucketCounts[i] === "object")
                                message.bucketCounts[i] = new $util.LongBits(object.bucketCounts[i].low >>> 0, object.bucketCounts[i].high >>> 0).toNumber(true);
                    }
                    return message;
                };

                /**
                 * Creates a plain object from a Buckets message. Also converts values to other types if specified.
                 * @function toObject
                 * @memberof outray.otlp.ExponentialHistogramDataPoint.Buckets
                 * @static
                 * @param {outray.otlp.ExponentialHistogramDataPoint.Buckets} message Buckets
                 * @param {$protobuf.IConversionOptions} [options] Conversion options
                 * @returns {Object.<string,*>} Plain object
                 */
                Buckets.toObject = function (message, options, _depth) {
                    if (!options)
                        options = {};
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    let object = {};
                    if (options.arrays || options.defaults)
                        object.bucketCounts = [];
                    if (options.defaults)
                        object.offset = 0;
                    if (message.offset != null && $Object.hasOwnProperty.call(message, "offset"))
                        object.offset = message.offset;
                    if (message.bucketCounts && message.bucketCounts.length) {
                        object.bucketCounts = $Array(message.bucketCounts.length);
                        for (let j = 0; j < message.bucketCounts.length; ++j)
                            if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                                object.bucketCounts[j] = typeof message.bucketCounts[j] === "number" ? $BigInt(message.bucketCounts[j]) : $util.Long.fromBits(message.bucketCounts[j].low >>> 0, message.bucketCounts[j].high >>> 0, true).toBigInt();
                            else if (typeof message.bucketCounts[j] === "number")
                                object.bucketCounts[j] = options.longs === $String ? $String(message.bucketCounts[j]) : message.bucketCounts[j];
                            else
                                object.bucketCounts[j] = options.longs === $String ? $util.Long.prototype.toString.call(message.bucketCounts[j]) : options.longs === $Number ? new $util.LongBits(message.bucketCounts[j].low >>> 0, message.bucketCounts[j].high >>> 0).toNumber(true) : message.bucketCounts[j];
                    }
                    return object;
                };

                /**
                 * Converts this Buckets to JSON.
                 * @function toJSON
                 * @memberof outray.otlp.ExponentialHistogramDataPoint.Buckets
                 * @instance
                 * @returns {Object.<string,*>} JSON object
                 */
                Buckets.prototype.toJSON = function() {
                    return Buckets.toObject(this, $protobuf.util.toJSONOptions);
                };

                return Buckets;
            })();

            return ExponentialHistogramDataPoint;
        })();

        otlp.SummaryDataPoint = (function() {

            /**
             * Properties of a SummaryDataPoint.
             * @typedef {Object} outray.otlp.SummaryDataPoint.$Properties
             * @property {Array.<outray.otlp.KeyValue.$Properties>|null} [attributes] SummaryDataPoint attributes
             * @property {number|Long|null} [startTimeUnixNano] SummaryDataPoint startTimeUnixNano
             * @property {number|Long|null} [timeUnixNano] SummaryDataPoint timeUnixNano
             * @property {number|Long|null} [count] SummaryDataPoint count
             * @property {number|null} [sum] SummaryDataPoint sum
             * @property {Array.<outray.otlp.SummaryDataPoint.ValueAtQuantile.$Properties>|null} [quantileValues] SummaryDataPoint quantileValues
             * @property {number|null} [flags] SummaryDataPoint flags
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of a SummaryDataPoint.
             * @memberof outray.otlp
             * @interface ISummaryDataPoint
             * @augments outray.otlp.SummaryDataPoint.$Properties
             * @deprecated Use outray.otlp.SummaryDataPoint.$Properties instead.
             */

            /**
             * Shape of a SummaryDataPoint.
             * @typedef {{
             *   attributes?: Array.<outray.otlp.KeyValue.$Shape>|null;
             *   startTimeUnixNano?: number|Long|null;
             *   timeUnixNano?: number|Long|null;
             *   count?: number|Long|null;
             *   sum?: number|null;
             *   quantileValues?: Array.<outray.otlp.SummaryDataPoint.ValueAtQuantile.$Shape>|null;
             *   flags?: number|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.SummaryDataPoint.$Shape
             */

            /**
             * Constructs a new SummaryDataPoint.
             * @memberof outray.otlp
             * @classdesc Represents a SummaryDataPoint.
             * @constructor
             * @param {outray.otlp.SummaryDataPoint.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const SummaryDataPoint = function (properties) {
                this.attributes = [];
                this.quantileValues = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * SummaryDataPoint attributes.
             * @member {Array.<outray.otlp.KeyValue.$Properties>} attributes
             * @memberof outray.otlp.SummaryDataPoint
             * @instance
             */
            SummaryDataPoint.prototype.attributes = $util.emptyArray;

            /**
             * SummaryDataPoint startTimeUnixNano.
             * @member {number|Long} startTimeUnixNano
             * @memberof outray.otlp.SummaryDataPoint
             * @instance
             */
            SummaryDataPoint.prototype.startTimeUnixNano = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * SummaryDataPoint timeUnixNano.
             * @member {number|Long} timeUnixNano
             * @memberof outray.otlp.SummaryDataPoint
             * @instance
             */
            SummaryDataPoint.prototype.timeUnixNano = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * SummaryDataPoint count.
             * @member {number|Long} count
             * @memberof outray.otlp.SummaryDataPoint
             * @instance
             */
            SummaryDataPoint.prototype.count = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * SummaryDataPoint sum.
             * @member {number} sum
             * @memberof outray.otlp.SummaryDataPoint
             * @instance
             */
            SummaryDataPoint.prototype.sum = 0;

            /**
             * SummaryDataPoint quantileValues.
             * @member {Array.<outray.otlp.SummaryDataPoint.ValueAtQuantile.$Properties>} quantileValues
             * @memberof outray.otlp.SummaryDataPoint
             * @instance
             */
            SummaryDataPoint.prototype.quantileValues = $util.emptyArray;

            /**
             * SummaryDataPoint flags.
             * @member {number} flags
             * @memberof outray.otlp.SummaryDataPoint
             * @instance
             */
            SummaryDataPoint.prototype.flags = 0;

            /**
             * Creates a new SummaryDataPoint instance using the specified properties.
             * @function create
             * @memberof outray.otlp.SummaryDataPoint
             * @static
             * @param {outray.otlp.SummaryDataPoint.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.SummaryDataPoint} SummaryDataPoint instance
             * @type {{
             *   (properties: outray.otlp.SummaryDataPoint.$Shape): outray.otlp.SummaryDataPoint & outray.otlp.SummaryDataPoint.$Shape;
             *   (properties?: outray.otlp.SummaryDataPoint.$Properties): outray.otlp.SummaryDataPoint;
             * }}
             */
            SummaryDataPoint.create = function(properties) {
                return new SummaryDataPoint(properties);
            };

            /**
             * Encodes the specified SummaryDataPoint message. Does not implicitly {@link outray.otlp.SummaryDataPoint.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.SummaryDataPoint
             * @static
             * @param {outray.otlp.SummaryDataPoint.$Properties} message SummaryDataPoint message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SummaryDataPoint.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.startTimeUnixNano != null && $Object.hasOwnProperty.call(message, "startTimeUnixNano") && (typeof message.startTimeUnixNano === "object" ? message.startTimeUnixNano.low || message.startTimeUnixNano.high : message.startTimeUnixNano !== 0))
                    writer.uint32(/* id 2, wireType 1 =*/17).fixed64(message.startTimeUnixNano);
                if (message.timeUnixNano != null && $Object.hasOwnProperty.call(message, "timeUnixNano") && (typeof message.timeUnixNano === "object" ? message.timeUnixNano.low || message.timeUnixNano.high : message.timeUnixNano !== 0))
                    writer.uint32(/* id 3, wireType 1 =*/25).fixed64(message.timeUnixNano);
                if (message.count != null && $Object.hasOwnProperty.call(message, "count") && (typeof message.count === "object" ? message.count.low || message.count.high : message.count !== 0))
                    writer.uint32(/* id 4, wireType 1 =*/33).fixed64(message.count);
                if (message.sum != null && $Object.hasOwnProperty.call(message, "sum") && !$Object.is(message.sum, 0))
                    writer.uint32(/* id 5, wireType 1 =*/41).double(message.sum);
                if (message.quantileValues != null && message.quantileValues.length)
                    for (let i = 0; i < message.quantileValues.length; ++i)
                        $root.outray.otlp.SummaryDataPoint.ValueAtQuantile.encode(message.quantileValues[i], writer.uint32(/* id 6, wireType 2 =*/50).fork(), _depth + 1).ldelim();
                if (message.attributes != null && message.attributes.length)
                    for (let i = 0; i < message.attributes.length; ++i)
                        $root.outray.otlp.KeyValue.encode(message.attributes[i], writer.uint32(/* id 7, wireType 2 =*/58).fork(), _depth + 1).ldelim();
                if (message.flags != null && $Object.hasOwnProperty.call(message, "flags") && message.flags !== 0)
                    writer.uint32(/* id 8, wireType 0 =*/64).uint32(message.flags);
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes a SummaryDataPoint message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.SummaryDataPoint
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.SummaryDataPoint & outray.otlp.SummaryDataPoint.$Shape} SummaryDataPoint
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SummaryDataPoint.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.SummaryDataPoint();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 7: {
                            if (wireType !== 2)
                                break;
                            if (!(message.attributes && message.attributes.length))
                                message.attributes = [];
                            message.attributes.push($root.outray.otlp.KeyValue.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 2: {
                            if (wireType !== 1)
                                break;
                            if (typeof (value = reader.fixed64()) === "object" ? value.low || value.high : value !== 0)
                                message.startTimeUnixNano = value;
                            else
                                delete message.startTimeUnixNano;
                            continue;
                        }
                    case 3: {
                            if (wireType !== 1)
                                break;
                            if (typeof (value = reader.fixed64()) === "object" ? value.low || value.high : value !== 0)
                                message.timeUnixNano = value;
                            else
                                delete message.timeUnixNano;
                            continue;
                        }
                    case 4: {
                            if (wireType !== 1)
                                break;
                            if (typeof (value = reader.fixed64()) === "object" ? value.low || value.high : value !== 0)
                                message.count = value;
                            else
                                delete message.count;
                            continue;
                        }
                    case 5: {
                            if (wireType !== 1)
                                break;
                            if (!$Object.is(value = reader.double(), 0))
                                message.sum = value;
                            else
                                delete message.sum;
                            continue;
                        }
                    case 6: {
                            if (wireType !== 2)
                                break;
                            if (!(message.quantileValues && message.quantileValues.length))
                                message.quantileValues = [];
                            message.quantileValues.push($root.outray.otlp.SummaryDataPoint.ValueAtQuantile.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 8: {
                            if (wireType !== 0)
                                break;
                            if (value = reader.uint32())
                                message.flags = value;
                            else
                                delete message.flags;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates a SummaryDataPoint message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.SummaryDataPoint
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.SummaryDataPoint} SummaryDataPoint
             */
            SummaryDataPoint.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.SummaryDataPoint)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.SummaryDataPoint: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.SummaryDataPoint();
                if (object.attributes) {
                    if (!$Array.isArray(object.attributes))
                        throw $TypeError(".outray.otlp.SummaryDataPoint.attributes: array expected");
                    message.attributes = $Array(object.attributes.length);
                    for (let i = 0; i < object.attributes.length; ++i) {
                        if (!$util.isObject(object.attributes[i]))
                            throw $TypeError(".outray.otlp.SummaryDataPoint.attributes: object expected");
                        message.attributes[i] = $root.outray.otlp.KeyValue.fromObject(object.attributes[i], _depth + 1);
                    }
                }
                if (object.startTimeUnixNano != null)
                    if (typeof object.startTimeUnixNano === "object" ? object.startTimeUnixNano.low || object.startTimeUnixNano.high : $Number(object.startTimeUnixNano) !== 0)
                        if ($util.Long)
                            message.startTimeUnixNano = $util.Long.fromValue(object.startTimeUnixNano, true);
                        else if (typeof object.startTimeUnixNano === "string")
                            message.startTimeUnixNano = $parseInt(object.startTimeUnixNano, 10);
                        else if (typeof object.startTimeUnixNano === "number")
                            message.startTimeUnixNano = object.startTimeUnixNano;
                        else if (typeof object.startTimeUnixNano === "object")
                            message.startTimeUnixNano = new $util.LongBits(object.startTimeUnixNano.low >>> 0, object.startTimeUnixNano.high >>> 0).toNumber(true);
                if (object.timeUnixNano != null)
                    if (typeof object.timeUnixNano === "object" ? object.timeUnixNano.low || object.timeUnixNano.high : $Number(object.timeUnixNano) !== 0)
                        if ($util.Long)
                            message.timeUnixNano = $util.Long.fromValue(object.timeUnixNano, true);
                        else if (typeof object.timeUnixNano === "string")
                            message.timeUnixNano = $parseInt(object.timeUnixNano, 10);
                        else if (typeof object.timeUnixNano === "number")
                            message.timeUnixNano = object.timeUnixNano;
                        else if (typeof object.timeUnixNano === "object")
                            message.timeUnixNano = new $util.LongBits(object.timeUnixNano.low >>> 0, object.timeUnixNano.high >>> 0).toNumber(true);
                if (object.count != null)
                    if (typeof object.count === "object" ? object.count.low || object.count.high : $Number(object.count) !== 0)
                        if ($util.Long)
                            message.count = $util.Long.fromValue(object.count, true);
                        else if (typeof object.count === "string")
                            message.count = $parseInt(object.count, 10);
                        else if (typeof object.count === "number")
                            message.count = object.count;
                        else if (typeof object.count === "object")
                            message.count = new $util.LongBits(object.count.low >>> 0, object.count.high >>> 0).toNumber(true);
                if (object.sum != null)
                    if (!$Object.is($Number(object.sum), 0))
                        message.sum = $Number(object.sum);
                if (object.quantileValues) {
                    if (!$Array.isArray(object.quantileValues))
                        throw $TypeError(".outray.otlp.SummaryDataPoint.quantileValues: array expected");
                    message.quantileValues = $Array(object.quantileValues.length);
                    for (let i = 0; i < object.quantileValues.length; ++i) {
                        if (!$util.isObject(object.quantileValues[i]))
                            throw $TypeError(".outray.otlp.SummaryDataPoint.quantileValues: object expected");
                        message.quantileValues[i] = $root.outray.otlp.SummaryDataPoint.ValueAtQuantile.fromObject(object.quantileValues[i], _depth + 1);
                    }
                }
                if (object.flags != null)
                    if ($Number(object.flags) !== 0)
                        message.flags = object.flags >>> 0;
                return message;
            };

            /**
             * Creates a plain object from a SummaryDataPoint message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.SummaryDataPoint
             * @static
             * @param {outray.otlp.SummaryDataPoint} message SummaryDataPoint
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            SummaryDataPoint.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults) {
                    object.quantileValues = [];
                    object.attributes = [];
                }
                if (options.defaults) {
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, true);
                        object.startTimeUnixNano = options.longs === $String ? long.toString() : options.longs === $Number ? long.toNumber() : typeof $BigInt !== "undefined" && options.longs === $BigInt ? long.toBigInt() : long;
                    } else
                        object.startTimeUnixNano = options.longs === $String ? "0" : typeof $BigInt !== "undefined" && options.longs === $BigInt ? $BigInt("0") : 0;
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, true);
                        object.timeUnixNano = options.longs === $String ? long.toString() : options.longs === $Number ? long.toNumber() : typeof $BigInt !== "undefined" && options.longs === $BigInt ? long.toBigInt() : long;
                    } else
                        object.timeUnixNano = options.longs === $String ? "0" : typeof $BigInt !== "undefined" && options.longs === $BigInt ? $BigInt("0") : 0;
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, true);
                        object.count = options.longs === $String ? long.toString() : options.longs === $Number ? long.toNumber() : typeof $BigInt !== "undefined" && options.longs === $BigInt ? long.toBigInt() : long;
                    } else
                        object.count = options.longs === $String ? "0" : typeof $BigInt !== "undefined" && options.longs === $BigInt ? $BigInt("0") : 0;
                    object.sum = 0;
                    object.flags = 0;
                }
                if (message.startTimeUnixNano != null && $Object.hasOwnProperty.call(message, "startTimeUnixNano"))
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.startTimeUnixNano = typeof message.startTimeUnixNano === "number" ? $BigInt(message.startTimeUnixNano) : $util.Long.fromBits(message.startTimeUnixNano.low >>> 0, message.startTimeUnixNano.high >>> 0, true).toBigInt();
                    else if (typeof message.startTimeUnixNano === "number")
                        object.startTimeUnixNano = options.longs === $String ? $String(message.startTimeUnixNano) : message.startTimeUnixNano;
                    else
                        object.startTimeUnixNano = options.longs === $String ? $util.Long.prototype.toString.call(message.startTimeUnixNano) : options.longs === $Number ? new $util.LongBits(message.startTimeUnixNano.low >>> 0, message.startTimeUnixNano.high >>> 0).toNumber(true) : message.startTimeUnixNano;
                if (message.timeUnixNano != null && $Object.hasOwnProperty.call(message, "timeUnixNano"))
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.timeUnixNano = typeof message.timeUnixNano === "number" ? $BigInt(message.timeUnixNano) : $util.Long.fromBits(message.timeUnixNano.low >>> 0, message.timeUnixNano.high >>> 0, true).toBigInt();
                    else if (typeof message.timeUnixNano === "number")
                        object.timeUnixNano = options.longs === $String ? $String(message.timeUnixNano) : message.timeUnixNano;
                    else
                        object.timeUnixNano = options.longs === $String ? $util.Long.prototype.toString.call(message.timeUnixNano) : options.longs === $Number ? new $util.LongBits(message.timeUnixNano.low >>> 0, message.timeUnixNano.high >>> 0).toNumber(true) : message.timeUnixNano;
                if (message.count != null && $Object.hasOwnProperty.call(message, "count"))
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.count = typeof message.count === "number" ? $BigInt(message.count) : $util.Long.fromBits(message.count.low >>> 0, message.count.high >>> 0, true).toBigInt();
                    else if (typeof message.count === "number")
                        object.count = options.longs === $String ? $String(message.count) : message.count;
                    else
                        object.count = options.longs === $String ? $util.Long.prototype.toString.call(message.count) : options.longs === $Number ? new $util.LongBits(message.count.low >>> 0, message.count.high >>> 0).toNumber(true) : message.count;
                if (message.sum != null && $Object.hasOwnProperty.call(message, "sum"))
                    object.sum = options.json && !$isFinite(message.sum) ? $String(message.sum) : message.sum;
                if (message.quantileValues && message.quantileValues.length) {
                    object.quantileValues = $Array(message.quantileValues.length);
                    for (let j = 0; j < message.quantileValues.length; ++j)
                        object.quantileValues[j] = $root.outray.otlp.SummaryDataPoint.ValueAtQuantile.toObject(message.quantileValues[j], options, _depth + 1);
                }
                if (message.attributes && message.attributes.length) {
                    object.attributes = $Array(message.attributes.length);
                    for (let j = 0; j < message.attributes.length; ++j)
                        object.attributes[j] = $root.outray.otlp.KeyValue.toObject(message.attributes[j], options, _depth + 1);
                }
                if (message.flags != null && $Object.hasOwnProperty.call(message, "flags"))
                    object.flags = message.flags;
                return object;
            };

            /**
             * Converts this SummaryDataPoint to JSON.
             * @function toJSON
             * @memberof outray.otlp.SummaryDataPoint
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            SummaryDataPoint.prototype.toJSON = function() {
                return SummaryDataPoint.toObject(this, $protobuf.util.toJSONOptions);
            };

            SummaryDataPoint.ValueAtQuantile = (function() {

                /**
                 * Properties of a ValueAtQuantile.
                 * @typedef {Object} outray.otlp.SummaryDataPoint.ValueAtQuantile.$Properties
                 * @property {number|null} [quantile] ValueAtQuantile quantile
                 * @property {number|null} [value] ValueAtQuantile value
                 * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
                 */

                /**
                 * Properties of a ValueAtQuantile.
                 * @memberof outray.otlp.SummaryDataPoint
                 * @interface IValueAtQuantile
                 * @augments outray.otlp.SummaryDataPoint.ValueAtQuantile.$Properties
                 * @deprecated Use outray.otlp.SummaryDataPoint.ValueAtQuantile.$Properties instead.
                 */

                /**
                 * Shape of a ValueAtQuantile.
                 * @typedef {outray.otlp.SummaryDataPoint.ValueAtQuantile.$Properties} outray.otlp.SummaryDataPoint.ValueAtQuantile.$Shape
                 */

                /**
                 * Constructs a new ValueAtQuantile.
                 * @memberof outray.otlp.SummaryDataPoint
                 * @classdesc Represents a ValueAtQuantile.
                 * @constructor
                 * @param {outray.otlp.SummaryDataPoint.ValueAtQuantile.$Properties=} [properties] Properties to set
                 * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
                 */
                const ValueAtQuantile = function (properties) {
                    if (properties)
                        for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                /**
                 * ValueAtQuantile quantile.
                 * @member {number} quantile
                 * @memberof outray.otlp.SummaryDataPoint.ValueAtQuantile
                 * @instance
                 */
                ValueAtQuantile.prototype.quantile = 0;

                /**
                 * ValueAtQuantile value.
                 * @member {number} value
                 * @memberof outray.otlp.SummaryDataPoint.ValueAtQuantile
                 * @instance
                 */
                ValueAtQuantile.prototype.value = 0;

                /**
                 * Creates a new ValueAtQuantile instance using the specified properties.
                 * @function create
                 * @memberof outray.otlp.SummaryDataPoint.ValueAtQuantile
                 * @static
                 * @param {outray.otlp.SummaryDataPoint.ValueAtQuantile.$Properties=} [properties] Properties to set
                 * @returns {outray.otlp.SummaryDataPoint.ValueAtQuantile} ValueAtQuantile instance
                 * @type {{
                 *   (properties: outray.otlp.SummaryDataPoint.ValueAtQuantile.$Shape): outray.otlp.SummaryDataPoint.ValueAtQuantile & outray.otlp.SummaryDataPoint.ValueAtQuantile.$Shape;
                 *   (properties?: outray.otlp.SummaryDataPoint.ValueAtQuantile.$Properties): outray.otlp.SummaryDataPoint.ValueAtQuantile;
                 * }}
                 */
                ValueAtQuantile.create = function(properties) {
                    return new ValueAtQuantile(properties);
                };

                /**
                 * Encodes the specified ValueAtQuantile message. Does not implicitly {@link outray.otlp.SummaryDataPoint.ValueAtQuantile.verify|verify} messages.
                 * @function encode
                 * @memberof outray.otlp.SummaryDataPoint.ValueAtQuantile
                 * @static
                 * @param {outray.otlp.SummaryDataPoint.ValueAtQuantile.$Properties} message ValueAtQuantile message or plain object to encode
                 * @param {$protobuf.Writer} [writer] Writer to encode to
                 * @returns {$protobuf.Writer} Writer
                 */
                ValueAtQuantile.encode = function (message, writer, _depth) {
                    if (!writer)
                        writer = $Writer.create();
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    if (message.quantile != null && $Object.hasOwnProperty.call(message, "quantile") && !$Object.is(message.quantile, 0))
                        writer.uint32(/* id 1, wireType 1 =*/9).double(message.quantile);
                    if (message.value != null && $Object.hasOwnProperty.call(message, "value") && !$Object.is(message.value, 0))
                        writer.uint32(/* id 2, wireType 1 =*/17).double(message.value);
                    if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                        for (let i = 0; i < message.$unknowns.length; ++i)
                            writer.raw(message.$unknowns[i]);
                    return writer;
                };

                /**
                 * Decodes a ValueAtQuantile message from the specified reader or buffer.
                 * @function decode
                 * @memberof outray.otlp.SummaryDataPoint.ValueAtQuantile
                 * @static
                 * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                 * @param {number} [length] Message length if known beforehand
                 * @returns {outray.otlp.SummaryDataPoint.ValueAtQuantile & outray.otlp.SummaryDataPoint.ValueAtQuantile.$Shape} ValueAtQuantile
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                ValueAtQuantile.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    let end, message, value;
                    if (length === $undefined)
                        end = reader.len;
                    else {
                        end = reader.pos + length;
                        if (end > reader.len)
                            throw $RangeError("index out of range");
                        length = reader.len;
                        reader.len = end;
                    }
                    message = _target || new $root.outray.otlp.SummaryDataPoint.ValueAtQuantile();
                    while (reader.pos < end) {
                        let start = reader.pos;
                        let tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        let wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 1)
                                    break;
                                if (!$Object.is(value = reader.double(), 0))
                                    message.quantile = value;
                                else
                                    delete message.quantile;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 1)
                                    break;
                                if (!$Object.is(value = reader.double(), 0))
                                    message.value = value;
                                else
                                    delete message.value;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (length !== $undefined) {
                        if (reader.pos !== end)
                            throw $RangeError("index out of range");
                        reader.len = length;
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                /**
                 * Creates a ValueAtQuantile message from a plain object. Also converts values to their respective internal types.
                 * @function fromObject
                 * @memberof outray.otlp.SummaryDataPoint.ValueAtQuantile
                 * @static
                 * @param {Object.<string,*>} object Plain object
                 * @returns {outray.otlp.SummaryDataPoint.ValueAtQuantile} ValueAtQuantile
                 */
                ValueAtQuantile.fromObject = function (object, _depth) {
                    if (object instanceof $root.outray.otlp.SummaryDataPoint.ValueAtQuantile)
                        return object;
                    if (!$util.isObject(object))
                        throw $TypeError(".outray.otlp.SummaryDataPoint.ValueAtQuantile: object expected");
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    let message = new $root.outray.otlp.SummaryDataPoint.ValueAtQuantile();
                    if (object.quantile != null)
                        if (!$Object.is($Number(object.quantile), 0))
                            message.quantile = $Number(object.quantile);
                    if (object.value != null)
                        if (!$Object.is($Number(object.value), 0))
                            message.value = $Number(object.value);
                    return message;
                };

                /**
                 * Creates a plain object from a ValueAtQuantile message. Also converts values to other types if specified.
                 * @function toObject
                 * @memberof outray.otlp.SummaryDataPoint.ValueAtQuantile
                 * @static
                 * @param {outray.otlp.SummaryDataPoint.ValueAtQuantile} message ValueAtQuantile
                 * @param {$protobuf.IConversionOptions} [options] Conversion options
                 * @returns {Object.<string,*>} Plain object
                 */
                ValueAtQuantile.toObject = function (message, options, _depth) {
                    if (!options)
                        options = {};
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $util.recursionLimit)
                        throw $Error("max depth exceeded");
                    let object = {};
                    if (options.defaults) {
                        object.quantile = 0;
                        object.value = 0;
                    }
                    if (message.quantile != null && $Object.hasOwnProperty.call(message, "quantile"))
                        object.quantile = options.json && !$isFinite(message.quantile) ? $String(message.quantile) : message.quantile;
                    if (message.value != null && $Object.hasOwnProperty.call(message, "value"))
                        object.value = options.json && !$isFinite(message.value) ? $String(message.value) : message.value;
                    return object;
                };

                /**
                 * Converts this ValueAtQuantile to JSON.
                 * @function toJSON
                 * @memberof outray.otlp.SummaryDataPoint.ValueAtQuantile
                 * @instance
                 * @returns {Object.<string,*>} JSON object
                 */
                ValueAtQuantile.prototype.toJSON = function() {
                    return ValueAtQuantile.toObject(this, $protobuf.util.toJSONOptions);
                };

                return ValueAtQuantile;
            })();

            return SummaryDataPoint;
        })();

        otlp.Exemplar = (function() {

            /**
             * Properties of an Exemplar.
             * @typedef {Object} outray.otlp.Exemplar.$Properties
             * @property {Array.<outray.otlp.KeyValue.$Properties>|null} [filteredAttributes] Exemplar filteredAttributes
             * @property {number|Long|null} [timeUnixNano] Exemplar timeUnixNano
             * @property {number|null} [asDouble] Exemplar asDouble
             * @property {number|Long|null} [asInt] Exemplar asInt
             * @property {Uint8Array|null} [spanId] Exemplar spanId
             * @property {Uint8Array|null} [traceId] Exemplar traceId
             * @property {"asDouble"|"asInt"} [value] Exemplar value
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of an Exemplar.
             * @memberof outray.otlp
             * @interface IExemplar
             * @augments outray.otlp.Exemplar.$Properties
             * @deprecated Use outray.otlp.Exemplar.$Properties instead.
             */

            /**
             * Narrowed shape of an Exemplar.
             * @typedef {{
             *   filteredAttributes?: Array.<outray.otlp.KeyValue.$Shape>|null;
             *   timeUnixNano?: number|Long|null;
             *   asDouble?: number|null;
             *   asInt?: number|Long|null;
             *   spanId?: Uint8Array|null;
             *   traceId?: Uint8Array|null;
             *   $unknowns?: Array.<Uint8Array>;
             * } & (
             *   ({ value?: undefined; asDouble?: null; asInt?: null }|{ value?: "asDouble"; asDouble: number; asInt?: null }|{ value?: "asInt"; asDouble?: null; asInt: number|Long })
             * )} outray.otlp.Exemplar.$Shape
             */

            /**
             * Constructs a new Exemplar.
             * @memberof outray.otlp
             * @classdesc Represents an Exemplar.
             * @constructor
             * @param {outray.otlp.Exemplar.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const Exemplar = function (properties) {
                this.filteredAttributes = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * Exemplar filteredAttributes.
             * @member {Array.<outray.otlp.KeyValue.$Properties>} filteredAttributes
             * @memberof outray.otlp.Exemplar
             * @instance
             */
            Exemplar.prototype.filteredAttributes = $util.emptyArray;

            /**
             * Exemplar timeUnixNano.
             * @member {number|Long} timeUnixNano
             * @memberof outray.otlp.Exemplar
             * @instance
             */
            Exemplar.prototype.timeUnixNano = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * Exemplar asDouble.
             * @member {number|null|undefined} asDouble
             * @memberof outray.otlp.Exemplar
             * @instance
             */
            Exemplar.prototype.asDouble = null;

            /**
             * Exemplar asInt.
             * @member {number|Long|null|undefined} asInt
             * @memberof outray.otlp.Exemplar
             * @instance
             */
            Exemplar.prototype.asInt = null;

            /**
             * Exemplar spanId.
             * @member {Uint8Array} spanId
             * @memberof outray.otlp.Exemplar
             * @instance
             */
            Exemplar.prototype.spanId = $util.newBuffer([]);

            /**
             * Exemplar traceId.
             * @member {Uint8Array} traceId
             * @memberof outray.otlp.Exemplar
             * @instance
             */
            Exemplar.prototype.traceId = $util.newBuffer([]);

            // OneOf field names bound to virtual getters and setters
            let $oneOfFields;

            /**
             * Exemplar value.
             * @member {"asDouble"|"asInt"|undefined} value
             * @memberof outray.otlp.Exemplar
             * @instance
             */
            $Object.defineProperty(Exemplar.prototype, "value", {
                get: $util.oneOfGetter($oneOfFields = ["asDouble", "asInt"]),
                set: $util.oneOfSetter($oneOfFields)
            });

            /**
             * Creates a new Exemplar instance using the specified properties.
             * @function create
             * @memberof outray.otlp.Exemplar
             * @static
             * @param {outray.otlp.Exemplar.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.Exemplar} Exemplar instance
             * @type {{
             *   (properties: outray.otlp.Exemplar.$Shape): outray.otlp.Exemplar & outray.otlp.Exemplar.$Shape;
             *   (properties?: outray.otlp.Exemplar.$Properties): outray.otlp.Exemplar;
             * }}
             */
            Exemplar.create = function(properties) {
                return new Exemplar(properties);
            };

            /**
             * Encodes the specified Exemplar message. Does not implicitly {@link outray.otlp.Exemplar.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.Exemplar
             * @static
             * @param {outray.otlp.Exemplar.$Properties} message Exemplar message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Exemplar.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.timeUnixNano != null && $Object.hasOwnProperty.call(message, "timeUnixNano") && (typeof message.timeUnixNano === "object" ? message.timeUnixNano.low || message.timeUnixNano.high : message.timeUnixNano !== 0))
                    writer.uint32(/* id 2, wireType 1 =*/17).fixed64(message.timeUnixNano);
                if (message.asDouble != null && $Object.hasOwnProperty.call(message, "asDouble"))
                    writer.uint32(/* id 3, wireType 1 =*/25).double(message.asDouble);
                if (message.spanId != null && $Object.hasOwnProperty.call(message, "spanId") && message.spanId.length)
                    writer.uint32(/* id 4, wireType 2 =*/34).bytes(message.spanId);
                if (message.traceId != null && $Object.hasOwnProperty.call(message, "traceId") && message.traceId.length)
                    writer.uint32(/* id 5, wireType 2 =*/42).bytes(message.traceId);
                if (message.asInt != null && $Object.hasOwnProperty.call(message, "asInt"))
                    writer.uint32(/* id 6, wireType 1 =*/49).sfixed64(message.asInt);
                if (message.filteredAttributes != null && message.filteredAttributes.length)
                    for (let i = 0; i < message.filteredAttributes.length; ++i)
                        $root.outray.otlp.KeyValue.encode(message.filteredAttributes[i], writer.uint32(/* id 7, wireType 2 =*/58).fork(), _depth + 1).ldelim();
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes an Exemplar message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.Exemplar
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.Exemplar & outray.otlp.Exemplar.$Shape} Exemplar
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Exemplar.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.Exemplar();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 7: {
                            if (wireType !== 2)
                                break;
                            if (!(message.filteredAttributes && message.filteredAttributes.length))
                                message.filteredAttributes = [];
                            message.filteredAttributes.push($root.outray.otlp.KeyValue.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    case 2: {
                            if (wireType !== 1)
                                break;
                            if (typeof (value = reader.fixed64()) === "object" ? value.low || value.high : value !== 0)
                                message.timeUnixNano = value;
                            else
                                delete message.timeUnixNano;
                            continue;
                        }
                    case 3: {
                            if (wireType !== 1)
                                break;
                            message.asDouble = reader.double();
                            message.value = "asDouble";
                            continue;
                        }
                    case 6: {
                            if (wireType !== 1)
                                break;
                            message.asInt = reader.sfixed64();
                            message.value = "asInt";
                            continue;
                        }
                    case 4: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.bytes()).length)
                                message.spanId = value;
                            else
                                delete message.spanId;
                            continue;
                        }
                    case 5: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.bytes()).length)
                                message.traceId = value;
                            else
                                delete message.traceId;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates an Exemplar message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.Exemplar
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.Exemplar} Exemplar
             */
            Exemplar.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.Exemplar)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.Exemplar: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.Exemplar();
                if (object.filteredAttributes) {
                    if (!$Array.isArray(object.filteredAttributes))
                        throw $TypeError(".outray.otlp.Exemplar.filteredAttributes: array expected");
                    message.filteredAttributes = $Array(object.filteredAttributes.length);
                    for (let i = 0; i < object.filteredAttributes.length; ++i) {
                        if (!$util.isObject(object.filteredAttributes[i]))
                            throw $TypeError(".outray.otlp.Exemplar.filteredAttributes: object expected");
                        message.filteredAttributes[i] = $root.outray.otlp.KeyValue.fromObject(object.filteredAttributes[i], _depth + 1);
                    }
                }
                if (object.timeUnixNano != null)
                    if (typeof object.timeUnixNano === "object" ? object.timeUnixNano.low || object.timeUnixNano.high : $Number(object.timeUnixNano) !== 0)
                        if ($util.Long)
                            message.timeUnixNano = $util.Long.fromValue(object.timeUnixNano, true);
                        else if (typeof object.timeUnixNano === "string")
                            message.timeUnixNano = $parseInt(object.timeUnixNano, 10);
                        else if (typeof object.timeUnixNano === "number")
                            message.timeUnixNano = object.timeUnixNano;
                        else if (typeof object.timeUnixNano === "object")
                            message.timeUnixNano = new $util.LongBits(object.timeUnixNano.low >>> 0, object.timeUnixNano.high >>> 0).toNumber(true);
                if (object.asDouble != null)
                    message.asDouble = $Number(object.asDouble);
                if (object.asInt != null)
                    if ($util.Long)
                        message.asInt = $util.Long.fromValue(object.asInt, false);
                    else if (typeof object.asInt === "string")
                        message.asInt = $parseInt(object.asInt, 10);
                    else if (typeof object.asInt === "number")
                        message.asInt = object.asInt;
                    else if (typeof object.asInt === "object")
                        message.asInt = new $util.LongBits(object.asInt.low >>> 0, object.asInt.high >>> 0).toNumber();
                if (object.spanId != null)
                    if (object.spanId.length)
                        if (typeof object.spanId === "string")
                            $util.base64.decode(object.spanId, message.spanId = $util.newBuffer($util.base64.length(object.spanId)), 0);
                        else if (object.spanId.length >= 0)
                            message.spanId = object.spanId;
                if (object.traceId != null)
                    if (object.traceId.length)
                        if (typeof object.traceId === "string")
                            $util.base64.decode(object.traceId, message.traceId = $util.newBuffer($util.base64.length(object.traceId)), 0);
                        else if (object.traceId.length >= 0)
                            message.traceId = object.traceId;
                return message;
            };

            /**
             * Creates a plain object from an Exemplar message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.Exemplar
             * @static
             * @param {outray.otlp.Exemplar} message Exemplar
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            Exemplar.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.filteredAttributes = [];
                if (options.defaults) {
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, true);
                        object.timeUnixNano = options.longs === $String ? long.toString() : options.longs === $Number ? long.toNumber() : typeof $BigInt !== "undefined" && options.longs === $BigInt ? long.toBigInt() : long;
                    } else
                        object.timeUnixNano = options.longs === $String ? "0" : typeof $BigInt !== "undefined" && options.longs === $BigInt ? $BigInt("0") : 0;
                    if (options.bytes === $String)
                        object.spanId = "";
                    else {
                        object.spanId = [];
                        if (options.bytes !== $Array)
                            object.spanId = $util.newBuffer(object.spanId);
                    }
                    if (options.bytes === $String)
                        object.traceId = "";
                    else {
                        object.traceId = [];
                        if (options.bytes !== $Array)
                            object.traceId = $util.newBuffer(object.traceId);
                    }
                }
                if (message.timeUnixNano != null && $Object.hasOwnProperty.call(message, "timeUnixNano"))
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.timeUnixNano = typeof message.timeUnixNano === "number" ? $BigInt(message.timeUnixNano) : $util.Long.fromBits(message.timeUnixNano.low >>> 0, message.timeUnixNano.high >>> 0, true).toBigInt();
                    else if (typeof message.timeUnixNano === "number")
                        object.timeUnixNano = options.longs === $String ? $String(message.timeUnixNano) : message.timeUnixNano;
                    else
                        object.timeUnixNano = options.longs === $String ? $util.Long.prototype.toString.call(message.timeUnixNano) : options.longs === $Number ? new $util.LongBits(message.timeUnixNano.low >>> 0, message.timeUnixNano.high >>> 0).toNumber(true) : message.timeUnixNano;
                if (message.asDouble != null && $Object.hasOwnProperty.call(message, "asDouble")) {
                    object.asDouble = options.json && !$isFinite(message.asDouble) ? $String(message.asDouble) : message.asDouble;
                    if (options.oneofs)
                        object.value = "asDouble";
                }
                if (message.spanId != null && $Object.hasOwnProperty.call(message, "spanId"))
                    object.spanId = options.bytes === $String ? $util.base64.encode(message.spanId, 0, message.spanId.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.spanId) : message.spanId;
                if (message.traceId != null && $Object.hasOwnProperty.call(message, "traceId"))
                    object.traceId = options.bytes === $String ? $util.base64.encode(message.traceId, 0, message.traceId.length) : options.bytes === $Array ? $Array.prototype.slice.call(message.traceId) : message.traceId;
                if (message.asInt != null && $Object.hasOwnProperty.call(message, "asInt")) {
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.asInt = typeof message.asInt === "number" ? $BigInt(message.asInt) : $util.Long.fromBits(message.asInt.low >>> 0, message.asInt.high >>> 0, false).toBigInt();
                    else if (typeof message.asInt === "number")
                        object.asInt = options.longs === $String ? $String(message.asInt) : message.asInt;
                    else
                        object.asInt = options.longs === $String ? $util.Long.prototype.toString.call(message.asInt) : options.longs === $Number ? new $util.LongBits(message.asInt.low >>> 0, message.asInt.high >>> 0).toNumber() : message.asInt;
                    if (options.oneofs)
                        object.value = "asInt";
                }
                if (message.filteredAttributes && message.filteredAttributes.length) {
                    object.filteredAttributes = $Array(message.filteredAttributes.length);
                    for (let j = 0; j < message.filteredAttributes.length; ++j)
                        object.filteredAttributes[j] = $root.outray.otlp.KeyValue.toObject(message.filteredAttributes[j], options, _depth + 1);
                }
                return object;
            };

            /**
             * Converts this Exemplar to JSON.
             * @function toJSON
             * @memberof outray.otlp.Exemplar
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            Exemplar.prototype.toJSON = function() {
                return Exemplar.toObject(this, $protobuf.util.toJSONOptions);
            };

            return Exemplar;
        })();

        otlp.ExportMetricsServiceRequest = (function() {

            /**
             * Properties of an ExportMetricsServiceRequest.
             * @typedef {Object} outray.otlp.ExportMetricsServiceRequest.$Properties
             * @property {Array.<outray.otlp.ResourceMetrics.$Properties>|null} [resourceMetrics] ExportMetricsServiceRequest resourceMetrics
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of an ExportMetricsServiceRequest.
             * @memberof outray.otlp
             * @interface IExportMetricsServiceRequest
             * @augments outray.otlp.ExportMetricsServiceRequest.$Properties
             * @deprecated Use outray.otlp.ExportMetricsServiceRequest.$Properties instead.
             */

            /**
             * Shape of an ExportMetricsServiceRequest.
             * @typedef {{
             *   resourceMetrics?: Array.<outray.otlp.ResourceMetrics.$Shape>|null;
             *   $unknowns?: Array.<Uint8Array>;
             * }} outray.otlp.ExportMetricsServiceRequest.$Shape
             */

            /**
             * Constructs a new ExportMetricsServiceRequest.
             * @memberof outray.otlp
             * @classdesc Represents an ExportMetricsServiceRequest.
             * @constructor
             * @param {outray.otlp.ExportMetricsServiceRequest.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const ExportMetricsServiceRequest = function (properties) {
                this.resourceMetrics = [];
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * ExportMetricsServiceRequest resourceMetrics.
             * @member {Array.<outray.otlp.ResourceMetrics.$Properties>} resourceMetrics
             * @memberof outray.otlp.ExportMetricsServiceRequest
             * @instance
             */
            ExportMetricsServiceRequest.prototype.resourceMetrics = $util.emptyArray;

            /**
             * Creates a new ExportMetricsServiceRequest instance using the specified properties.
             * @function create
             * @memberof outray.otlp.ExportMetricsServiceRequest
             * @static
             * @param {outray.otlp.ExportMetricsServiceRequest.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.ExportMetricsServiceRequest} ExportMetricsServiceRequest instance
             * @type {{
             *   (properties: outray.otlp.ExportMetricsServiceRequest.$Shape): outray.otlp.ExportMetricsServiceRequest & outray.otlp.ExportMetricsServiceRequest.$Shape;
             *   (properties?: outray.otlp.ExportMetricsServiceRequest.$Properties): outray.otlp.ExportMetricsServiceRequest;
             * }}
             */
            ExportMetricsServiceRequest.create = function(properties) {
                return new ExportMetricsServiceRequest(properties);
            };

            /**
             * Encodes the specified ExportMetricsServiceRequest message. Does not implicitly {@link outray.otlp.ExportMetricsServiceRequest.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.ExportMetricsServiceRequest
             * @static
             * @param {outray.otlp.ExportMetricsServiceRequest.$Properties} message ExportMetricsServiceRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ExportMetricsServiceRequest.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.resourceMetrics != null && message.resourceMetrics.length)
                    for (let i = 0; i < message.resourceMetrics.length; ++i)
                        $root.outray.otlp.ResourceMetrics.encode(message.resourceMetrics[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes an ExportMetricsServiceRequest message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.ExportMetricsServiceRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.ExportMetricsServiceRequest & outray.otlp.ExportMetricsServiceRequest.$Shape} ExportMetricsServiceRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ExportMetricsServiceRequest.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.ExportMetricsServiceRequest();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            if (!(message.resourceMetrics && message.resourceMetrics.length))
                                message.resourceMetrics = [];
                            message.resourceMetrics.push($root.outray.otlp.ResourceMetrics.decode(reader, reader.uint32(), $undefined, _depth + 1));
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates an ExportMetricsServiceRequest message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.ExportMetricsServiceRequest
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.ExportMetricsServiceRequest} ExportMetricsServiceRequest
             */
            ExportMetricsServiceRequest.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.ExportMetricsServiceRequest)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.ExportMetricsServiceRequest: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.ExportMetricsServiceRequest();
                if (object.resourceMetrics) {
                    if (!$Array.isArray(object.resourceMetrics))
                        throw $TypeError(".outray.otlp.ExportMetricsServiceRequest.resourceMetrics: array expected");
                    message.resourceMetrics = $Array(object.resourceMetrics.length);
                    for (let i = 0; i < object.resourceMetrics.length; ++i) {
                        if (!$util.isObject(object.resourceMetrics[i]))
                            throw $TypeError(".outray.otlp.ExportMetricsServiceRequest.resourceMetrics: object expected");
                        message.resourceMetrics[i] = $root.outray.otlp.ResourceMetrics.fromObject(object.resourceMetrics[i], _depth + 1);
                    }
                }
                return message;
            };

            /**
             * Creates a plain object from an ExportMetricsServiceRequest message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.ExportMetricsServiceRequest
             * @static
             * @param {outray.otlp.ExportMetricsServiceRequest} message ExportMetricsServiceRequest
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ExportMetricsServiceRequest.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.arrays || options.defaults)
                    object.resourceMetrics = [];
                if (message.resourceMetrics && message.resourceMetrics.length) {
                    object.resourceMetrics = $Array(message.resourceMetrics.length);
                    for (let j = 0; j < message.resourceMetrics.length; ++j)
                        object.resourceMetrics[j] = $root.outray.otlp.ResourceMetrics.toObject(message.resourceMetrics[j], options, _depth + 1);
                }
                return object;
            };

            /**
             * Converts this ExportMetricsServiceRequest to JSON.
             * @function toJSON
             * @memberof outray.otlp.ExportMetricsServiceRequest
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ExportMetricsServiceRequest.prototype.toJSON = function() {
                return ExportMetricsServiceRequest.toObject(this, $protobuf.util.toJSONOptions);
            };

            return ExportMetricsServiceRequest;
        })();

        otlp.ExportMetricsServiceResponse = (function() {

            /**
             * Properties of an ExportMetricsServiceResponse.
             * @typedef {Object} outray.otlp.ExportMetricsServiceResponse.$Properties
             * @property {outray.otlp.ExportMetricsPartialSuccess.$Properties|null} [partialSuccess] ExportMetricsServiceResponse partialSuccess
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of an ExportMetricsServiceResponse.
             * @memberof outray.otlp
             * @interface IExportMetricsServiceResponse
             * @augments outray.otlp.ExportMetricsServiceResponse.$Properties
             * @deprecated Use outray.otlp.ExportMetricsServiceResponse.$Properties instead.
             */

            /**
             * Shape of an ExportMetricsServiceResponse.
             * @typedef {outray.otlp.ExportMetricsServiceResponse.$Properties} outray.otlp.ExportMetricsServiceResponse.$Shape
             */

            /**
             * Constructs a new ExportMetricsServiceResponse.
             * @memberof outray.otlp
             * @classdesc Represents an ExportMetricsServiceResponse.
             * @constructor
             * @param {outray.otlp.ExportMetricsServiceResponse.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const ExportMetricsServiceResponse = function (properties) {
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * ExportMetricsServiceResponse partialSuccess.
             * @member {outray.otlp.ExportMetricsPartialSuccess.$Properties|null|undefined} partialSuccess
             * @memberof outray.otlp.ExportMetricsServiceResponse
             * @instance
             */
            ExportMetricsServiceResponse.prototype.partialSuccess = null;

            /**
             * Creates a new ExportMetricsServiceResponse instance using the specified properties.
             * @function create
             * @memberof outray.otlp.ExportMetricsServiceResponse
             * @static
             * @param {outray.otlp.ExportMetricsServiceResponse.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.ExportMetricsServiceResponse} ExportMetricsServiceResponse instance
             * @type {{
             *   (properties: outray.otlp.ExportMetricsServiceResponse.$Shape): outray.otlp.ExportMetricsServiceResponse & outray.otlp.ExportMetricsServiceResponse.$Shape;
             *   (properties?: outray.otlp.ExportMetricsServiceResponse.$Properties): outray.otlp.ExportMetricsServiceResponse;
             * }}
             */
            ExportMetricsServiceResponse.create = function(properties) {
                return new ExportMetricsServiceResponse(properties);
            };

            /**
             * Encodes the specified ExportMetricsServiceResponse message. Does not implicitly {@link outray.otlp.ExportMetricsServiceResponse.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.ExportMetricsServiceResponse
             * @static
             * @param {outray.otlp.ExportMetricsServiceResponse.$Properties} message ExportMetricsServiceResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ExportMetricsServiceResponse.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.partialSuccess != null && $Object.hasOwnProperty.call(message, "partialSuccess"))
                    $root.outray.otlp.ExportMetricsPartialSuccess.encode(message.partialSuccess, writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes an ExportMetricsServiceResponse message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.ExportMetricsServiceResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.ExportMetricsServiceResponse & outray.otlp.ExportMetricsServiceResponse.$Shape} ExportMetricsServiceResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ExportMetricsServiceResponse.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.ExportMetricsServiceResponse();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 2)
                                break;
                            message.partialSuccess = $root.outray.otlp.ExportMetricsPartialSuccess.decode(reader, reader.uint32(), $undefined, _depth + 1, message.partialSuccess);
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates an ExportMetricsServiceResponse message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.ExportMetricsServiceResponse
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.ExportMetricsServiceResponse} ExportMetricsServiceResponse
             */
            ExportMetricsServiceResponse.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.ExportMetricsServiceResponse)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.ExportMetricsServiceResponse: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.ExportMetricsServiceResponse();
                if (object.partialSuccess != null) {
                    if (!$util.isObject(object.partialSuccess))
                        throw $TypeError(".outray.otlp.ExportMetricsServiceResponse.partialSuccess: object expected");
                    message.partialSuccess = $root.outray.otlp.ExportMetricsPartialSuccess.fromObject(object.partialSuccess, _depth + 1);
                }
                return message;
            };

            /**
             * Creates a plain object from an ExportMetricsServiceResponse message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.ExportMetricsServiceResponse
             * @static
             * @param {outray.otlp.ExportMetricsServiceResponse} message ExportMetricsServiceResponse
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ExportMetricsServiceResponse.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.defaults)
                    object.partialSuccess = null;
                if (message.partialSuccess != null && $Object.hasOwnProperty.call(message, "partialSuccess"))
                    object.partialSuccess = $root.outray.otlp.ExportMetricsPartialSuccess.toObject(message.partialSuccess, options, _depth + 1);
                return object;
            };

            /**
             * Converts this ExportMetricsServiceResponse to JSON.
             * @function toJSON
             * @memberof outray.otlp.ExportMetricsServiceResponse
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ExportMetricsServiceResponse.prototype.toJSON = function() {
                return ExportMetricsServiceResponse.toObject(this, $protobuf.util.toJSONOptions);
            };

            return ExportMetricsServiceResponse;
        })();

        otlp.ExportMetricsPartialSuccess = (function() {

            /**
             * Properties of an ExportMetricsPartialSuccess.
             * @typedef {Object} outray.otlp.ExportMetricsPartialSuccess.$Properties
             * @property {number|Long|null} [rejectedDataPoints] ExportMetricsPartialSuccess rejectedDataPoints
             * @property {string|null} [errorMessage] ExportMetricsPartialSuccess errorMessage
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */

            /**
             * Properties of an ExportMetricsPartialSuccess.
             * @memberof outray.otlp
             * @interface IExportMetricsPartialSuccess
             * @augments outray.otlp.ExportMetricsPartialSuccess.$Properties
             * @deprecated Use outray.otlp.ExportMetricsPartialSuccess.$Properties instead.
             */

            /**
             * Shape of an ExportMetricsPartialSuccess.
             * @typedef {outray.otlp.ExportMetricsPartialSuccess.$Properties} outray.otlp.ExportMetricsPartialSuccess.$Shape
             */

            /**
             * Constructs a new ExportMetricsPartialSuccess.
             * @memberof outray.otlp
             * @classdesc Represents an ExportMetricsPartialSuccess.
             * @constructor
             * @param {outray.otlp.ExportMetricsPartialSuccess.$Properties=} [properties] Properties to set
             * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
             */
            const ExportMetricsPartialSuccess = function (properties) {
                if (properties)
                    for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null && keys[i] !== "__proto__")
                            this[keys[i]] = properties[keys[i]];
            };

            /**
             * ExportMetricsPartialSuccess rejectedDataPoints.
             * @member {number|Long} rejectedDataPoints
             * @memberof outray.otlp.ExportMetricsPartialSuccess
             * @instance
             */
            ExportMetricsPartialSuccess.prototype.rejectedDataPoints = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

            /**
             * ExportMetricsPartialSuccess errorMessage.
             * @member {string} errorMessage
             * @memberof outray.otlp.ExportMetricsPartialSuccess
             * @instance
             */
            ExportMetricsPartialSuccess.prototype.errorMessage = "";

            /**
             * Creates a new ExportMetricsPartialSuccess instance using the specified properties.
             * @function create
             * @memberof outray.otlp.ExportMetricsPartialSuccess
             * @static
             * @param {outray.otlp.ExportMetricsPartialSuccess.$Properties=} [properties] Properties to set
             * @returns {outray.otlp.ExportMetricsPartialSuccess} ExportMetricsPartialSuccess instance
             * @type {{
             *   (properties: outray.otlp.ExportMetricsPartialSuccess.$Shape): outray.otlp.ExportMetricsPartialSuccess & outray.otlp.ExportMetricsPartialSuccess.$Shape;
             *   (properties?: outray.otlp.ExportMetricsPartialSuccess.$Properties): outray.otlp.ExportMetricsPartialSuccess;
             * }}
             */
            ExportMetricsPartialSuccess.create = function(properties) {
                return new ExportMetricsPartialSuccess(properties);
            };

            /**
             * Encodes the specified ExportMetricsPartialSuccess message. Does not implicitly {@link outray.otlp.ExportMetricsPartialSuccess.verify|verify} messages.
             * @function encode
             * @memberof outray.otlp.ExportMetricsPartialSuccess
             * @static
             * @param {outray.otlp.ExportMetricsPartialSuccess.$Properties} message ExportMetricsPartialSuccess message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ExportMetricsPartialSuccess.encode = function (message, writer, _depth) {
                if (!writer)
                    writer = $Writer.create();
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                if (message.rejectedDataPoints != null && $Object.hasOwnProperty.call(message, "rejectedDataPoints") && (typeof message.rejectedDataPoints === "object" ? message.rejectedDataPoints.low || message.rejectedDataPoints.high : message.rejectedDataPoints !== 0))
                    writer.uint32(/* id 1, wireType 0 =*/8).int64(message.rejectedDataPoints);
                if (message.errorMessage != null && $Object.hasOwnProperty.call(message, "errorMessage") && message.errorMessage !== "")
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.errorMessage);
                if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                    for (let i = 0; i < message.$unknowns.length; ++i)
                        writer.raw(message.$unknowns[i]);
                return writer;
            };

            /**
             * Decodes an ExportMetricsPartialSuccess message from the specified reader or buffer.
             * @function decode
             * @memberof outray.otlp.ExportMetricsPartialSuccess
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {outray.otlp.ExportMetricsPartialSuccess & outray.otlp.ExportMetricsPartialSuccess.$Shape} ExportMetricsPartialSuccess
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ExportMetricsPartialSuccess.decode = function (reader, length, _end, _depth, _target) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $Reader.recursionLimit)
                    throw $Error("max depth exceeded");
                let end, message, value;
                if (length === $undefined)
                    end = reader.len;
                else {
                    end = reader.pos + length;
                    if (end > reader.len)
                        throw $RangeError("index out of range");
                    length = reader.len;
                    reader.len = end;
                }
                message = _target || new $root.outray.otlp.ExportMetricsPartialSuccess();
                while (reader.pos < end) {
                    let start = reader.pos;
                    let tag = reader.tag();
                    if (tag === _end) {
                        _end = $undefined;
                        break;
                    }
                    let wireType = tag & 7;
                    switch (tag >>>= 3) {
                    case 1: {
                            if (wireType !== 0)
                                break;
                            if (typeof (value = reader.int64()) === "object" ? value.low || value.high : value !== 0)
                                message.rejectedDataPoints = value;
                            else
                                delete message.rejectedDataPoints;
                            continue;
                        }
                    case 2: {
                            if (wireType !== 2)
                                break;
                            if ((value = reader.stringVerify()).length)
                                message.errorMessage = value;
                            else
                                delete message.errorMessage;
                            continue;
                        }
                    }
                    reader.skipType(wireType, _depth, tag);
                    if (!reader.discardUnknown) {
                        $util.makeProp(message, "$unknowns", false);
                        (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                    }
                }
                if (length !== $undefined) {
                    if (reader.pos !== end)
                        throw $RangeError("index out of range");
                    reader.len = length;
                }
                if (_end !== $undefined)
                    throw $Error("missing end group");
                return message;
            };

            /**
             * Creates an ExportMetricsPartialSuccess message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof outray.otlp.ExportMetricsPartialSuccess
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {outray.otlp.ExportMetricsPartialSuccess} ExportMetricsPartialSuccess
             */
            ExportMetricsPartialSuccess.fromObject = function (object, _depth) {
                if (object instanceof $root.outray.otlp.ExportMetricsPartialSuccess)
                    return object;
                if (!$util.isObject(object))
                    throw $TypeError(".outray.otlp.ExportMetricsPartialSuccess: object expected");
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let message = new $root.outray.otlp.ExportMetricsPartialSuccess();
                if (object.rejectedDataPoints != null)
                    if (typeof object.rejectedDataPoints === "object" ? object.rejectedDataPoints.low || object.rejectedDataPoints.high : $Number(object.rejectedDataPoints) !== 0)
                        if ($util.Long)
                            message.rejectedDataPoints = $util.Long.fromValue(object.rejectedDataPoints, false);
                        else if (typeof object.rejectedDataPoints === "string")
                            message.rejectedDataPoints = $parseInt(object.rejectedDataPoints, 10);
                        else if (typeof object.rejectedDataPoints === "number")
                            message.rejectedDataPoints = object.rejectedDataPoints;
                        else if (typeof object.rejectedDataPoints === "object")
                            message.rejectedDataPoints = new $util.LongBits(object.rejectedDataPoints.low >>> 0, object.rejectedDataPoints.high >>> 0).toNumber();
                if (object.errorMessage != null)
                    if (typeof object.errorMessage !== "string" || object.errorMessage.length)
                        message.errorMessage = $String(object.errorMessage);
                return message;
            };

            /**
             * Creates a plain object from an ExportMetricsPartialSuccess message. Also converts values to other types if specified.
             * @function toObject
             * @memberof outray.otlp.ExportMetricsPartialSuccess
             * @static
             * @param {outray.otlp.ExportMetricsPartialSuccess} message ExportMetricsPartialSuccess
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ExportMetricsPartialSuccess.toObject = function (message, options, _depth) {
                if (!options)
                    options = {};
                if (_depth === $undefined)
                    _depth = 0;
                if (_depth > $util.recursionLimit)
                    throw $Error("max depth exceeded");
                let object = {};
                if (options.defaults) {
                    if ($util.Long) {
                        let long = new $util.Long(0, 0, false);
                        object.rejectedDataPoints = options.longs === $String ? long.toString() : options.longs === $Number ? long.toNumber() : typeof $BigInt !== "undefined" && options.longs === $BigInt ? long.toBigInt() : long;
                    } else
                        object.rejectedDataPoints = options.longs === $String ? "0" : typeof $BigInt !== "undefined" && options.longs === $BigInt ? $BigInt("0") : 0;
                    object.errorMessage = "";
                }
                if (message.rejectedDataPoints != null && $Object.hasOwnProperty.call(message, "rejectedDataPoints"))
                    if (typeof $BigInt !== "undefined" && options.longs === $BigInt)
                        object.rejectedDataPoints = typeof message.rejectedDataPoints === "number" ? $BigInt(message.rejectedDataPoints) : $util.Long.fromBits(message.rejectedDataPoints.low >>> 0, message.rejectedDataPoints.high >>> 0, false).toBigInt();
                    else if (typeof message.rejectedDataPoints === "number")
                        object.rejectedDataPoints = options.longs === $String ? $String(message.rejectedDataPoints) : message.rejectedDataPoints;
                    else
                        object.rejectedDataPoints = options.longs === $String ? $util.Long.prototype.toString.call(message.rejectedDataPoints) : options.longs === $Number ? new $util.LongBits(message.rejectedDataPoints.low >>> 0, message.rejectedDataPoints.high >>> 0).toNumber() : message.rejectedDataPoints;
                if (message.errorMessage != null && $Object.hasOwnProperty.call(message, "errorMessage"))
                    object.errorMessage = message.errorMessage;
                return object;
            };

            /**
             * Converts this ExportMetricsPartialSuccess to JSON.
             * @function toJSON
             * @memberof outray.otlp.ExportMetricsPartialSuccess
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ExportMetricsPartialSuccess.prototype.toJSON = function() {
                return ExportMetricsPartialSuccess.toObject(this, $protobuf.util.toJSONOptions);
            };

            return ExportMetricsPartialSuccess;
        })();

        return otlp;
    })();

    return outray;
})();

export {
  $root as default
};
