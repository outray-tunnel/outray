// Generated from src/proto/otlp.proto; do not edit by hand.
// Regenerate: npm run generate:protobuf --workspace=outray-ingest
import * as $protobuf from "protobufjs/minimal.js";
import Long = require("long");

/** Namespace outray. */
export namespace outray {

    /** Namespace otlp. */
    namespace otlp {

        /**
         * Properties of an AnyValue.
         * @deprecated Use outray.otlp.AnyValue.$Properties instead.
         */
        interface IAnyValue extends outray.otlp.AnyValue.$Properties {
        }

        /** Represents an AnyValue. */
        class AnyValue {

            /**
             * Constructs a new AnyValue.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.AnyValue.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** AnyValue stringValue. */
            stringValue?: (string|null);

            /** AnyValue boolValue. */
            boolValue?: (boolean|null);

            /** AnyValue intValue. */
            intValue?: (number|Long|null);

            /** AnyValue doubleValue. */
            doubleValue?: (number|null);

            /** AnyValue arrayValue. */
            arrayValue?: (outray.otlp.ArrayValue.$Properties|null);

            /** AnyValue kvlistValue. */
            kvlistValue?: (outray.otlp.KeyValueList.$Properties|null);

            /** AnyValue bytesValue. */
            bytesValue?: (Uint8Array|null);

            /** AnyValue value. */
            value?: ("stringValue"|"boolValue"|"intValue"|"doubleValue"|"arrayValue"|"kvlistValue"|"bytesValue");

            /**
             * Creates a new AnyValue instance using the specified properties.
             * @param [properties] Properties to set
             * @returns AnyValue instance
             */
            static create(properties: outray.otlp.AnyValue.$Shape): outray.otlp.AnyValue & outray.otlp.AnyValue.$Shape;
            static create(properties?: outray.otlp.AnyValue.$Properties): outray.otlp.AnyValue;

            /**
             * Encodes the specified AnyValue message. Does not implicitly {@link outray.otlp.AnyValue.verify|verify} messages.
             * @param message AnyValue message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.AnyValue.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an AnyValue message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.AnyValue & outray.otlp.AnyValue.$Shape} AnyValue
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.AnyValue & outray.otlp.AnyValue.$Shape;

            /**
             * Creates an AnyValue message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns AnyValue
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.AnyValue;

            /**
             * Creates a plain object from an AnyValue message. Also converts values to other types if specified.
             * @param message AnyValue
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.AnyValue, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this AnyValue to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace AnyValue {

            /** Properties of an AnyValue. */
            interface $Properties {

                /** AnyValue stringValue */
                stringValue?: (string|null);

                /** AnyValue boolValue */
                boolValue?: (boolean|null);

                /** AnyValue intValue */
                intValue?: (number|Long|null);

                /** AnyValue doubleValue */
                doubleValue?: (number|null);

                /** AnyValue arrayValue */
                arrayValue?: (outray.otlp.ArrayValue.$Properties|null);

                /** AnyValue kvlistValue */
                kvlistValue?: (outray.otlp.KeyValueList.$Properties|null);

                /** AnyValue bytesValue */
                bytesValue?: (Uint8Array|null);

                /** AnyValue value */
                value?: ("stringValue"|"boolValue"|"intValue"|"doubleValue"|"arrayValue"|"kvlistValue"|"bytesValue");

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Narrowed shape of an AnyValue. */
            type $Shape = {
              stringValue?: string|null;
              boolValue?: boolean|null;
              intValue?: number|Long|null;
              doubleValue?: number|null;
              arrayValue?: outray.otlp.ArrayValue.$Shape|null;
              kvlistValue?: outray.otlp.KeyValueList.$Shape|null;
              bytesValue?: Uint8Array|null;
              $unknowns?: Uint8Array[];
            } & (
              ({ value?: undefined; stringValue?: null; boolValue?: null; intValue?: null; doubleValue?: null; arrayValue?: null; kvlistValue?: null; bytesValue?: null }|{ value?: "stringValue"; stringValue: string; boolValue?: null; intValue?: null; doubleValue?: null; arrayValue?: null; kvlistValue?: null; bytesValue?: null }|{ value?: "boolValue"; stringValue?: null; boolValue: boolean; intValue?: null; doubleValue?: null; arrayValue?: null; kvlistValue?: null; bytesValue?: null }|{ value?: "intValue"; stringValue?: null; boolValue?: null; intValue: number|Long; doubleValue?: null; arrayValue?: null; kvlistValue?: null; bytesValue?: null }|{ value?: "doubleValue"; stringValue?: null; boolValue?: null; intValue?: null; doubleValue: number; arrayValue?: null; kvlistValue?: null; bytesValue?: null }|{ value?: "arrayValue"; stringValue?: null; boolValue?: null; intValue?: null; doubleValue?: null; arrayValue: outray.otlp.ArrayValue.$Shape; kvlistValue?: null; bytesValue?: null }|{ value?: "kvlistValue"; stringValue?: null; boolValue?: null; intValue?: null; doubleValue?: null; arrayValue?: null; kvlistValue: outray.otlp.KeyValueList.$Shape; bytesValue?: null }|{ value?: "bytesValue"; stringValue?: null; boolValue?: null; intValue?: null; doubleValue?: null; arrayValue?: null; kvlistValue?: null; bytesValue: Uint8Array })
            );
        }

        /**
         * Properties of an ArrayValue.
         * @deprecated Use outray.otlp.ArrayValue.$Properties instead.
         */
        interface IArrayValue extends outray.otlp.ArrayValue.$Properties {
        }

        /** Represents an ArrayValue. */
        class ArrayValue {

            /**
             * Constructs a new ArrayValue.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.ArrayValue.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** ArrayValue values. */
            values: outray.otlp.AnyValue.$Properties[];

            /**
             * Creates a new ArrayValue instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ArrayValue instance
             */
            static create(properties: outray.otlp.ArrayValue.$Shape): outray.otlp.ArrayValue & outray.otlp.ArrayValue.$Shape;
            static create(properties?: outray.otlp.ArrayValue.$Properties): outray.otlp.ArrayValue;

            /**
             * Encodes the specified ArrayValue message. Does not implicitly {@link outray.otlp.ArrayValue.verify|verify} messages.
             * @param message ArrayValue message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.ArrayValue.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an ArrayValue message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.ArrayValue & outray.otlp.ArrayValue.$Shape} ArrayValue
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.ArrayValue & outray.otlp.ArrayValue.$Shape;

            /**
             * Creates an ArrayValue message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ArrayValue
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.ArrayValue;

            /**
             * Creates a plain object from an ArrayValue message. Also converts values to other types if specified.
             * @param message ArrayValue
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.ArrayValue, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ArrayValue to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace ArrayValue {

            /** Properties of an ArrayValue. */
            interface $Properties {

                /** ArrayValue values */
                values?: (outray.otlp.AnyValue.$Properties[]|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of an ArrayValue. */
            type $Shape = {
              values?: outray.otlp.AnyValue.$Shape[]|null;
              $unknowns?: Uint8Array[];
            };
        }

        /**
         * Properties of a KeyValueList.
         * @deprecated Use outray.otlp.KeyValueList.$Properties instead.
         */
        interface IKeyValueList extends outray.otlp.KeyValueList.$Properties {
        }

        /** Represents a KeyValueList. */
        class KeyValueList {

            /**
             * Constructs a new KeyValueList.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.KeyValueList.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** KeyValueList values. */
            values: outray.otlp.KeyValue.$Properties[];

            /**
             * Creates a new KeyValueList instance using the specified properties.
             * @param [properties] Properties to set
             * @returns KeyValueList instance
             */
            static create(properties: outray.otlp.KeyValueList.$Shape): outray.otlp.KeyValueList & outray.otlp.KeyValueList.$Shape;
            static create(properties?: outray.otlp.KeyValueList.$Properties): outray.otlp.KeyValueList;

            /**
             * Encodes the specified KeyValueList message. Does not implicitly {@link outray.otlp.KeyValueList.verify|verify} messages.
             * @param message KeyValueList message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.KeyValueList.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a KeyValueList message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.KeyValueList & outray.otlp.KeyValueList.$Shape} KeyValueList
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.KeyValueList & outray.otlp.KeyValueList.$Shape;

            /**
             * Creates a KeyValueList message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns KeyValueList
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.KeyValueList;

            /**
             * Creates a plain object from a KeyValueList message. Also converts values to other types if specified.
             * @param message KeyValueList
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.KeyValueList, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this KeyValueList to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace KeyValueList {

            /** Properties of a KeyValueList. */
            interface $Properties {

                /** KeyValueList values */
                values?: (outray.otlp.KeyValue.$Properties[]|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of a KeyValueList. */
            type $Shape = {
              values?: outray.otlp.KeyValue.$Shape[]|null;
              $unknowns?: Uint8Array[];
            };
        }

        /**
         * Properties of a KeyValue.
         * @deprecated Use outray.otlp.KeyValue.$Properties instead.
         */
        interface IKeyValue extends outray.otlp.KeyValue.$Properties {
        }

        /** Represents a KeyValue. */
        class KeyValue {

            /**
             * Constructs a new KeyValue.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.KeyValue.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** KeyValue key. */
            key: string;

            /** KeyValue value. */
            value?: (outray.otlp.AnyValue.$Properties|null);

            /**
             * Creates a new KeyValue instance using the specified properties.
             * @param [properties] Properties to set
             * @returns KeyValue instance
             */
            static create(properties: outray.otlp.KeyValue.$Shape): outray.otlp.KeyValue & outray.otlp.KeyValue.$Shape;
            static create(properties?: outray.otlp.KeyValue.$Properties): outray.otlp.KeyValue;

            /**
             * Encodes the specified KeyValue message. Does not implicitly {@link outray.otlp.KeyValue.verify|verify} messages.
             * @param message KeyValue message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.KeyValue.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a KeyValue message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.KeyValue & outray.otlp.KeyValue.$Shape} KeyValue
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.KeyValue & outray.otlp.KeyValue.$Shape;

            /**
             * Creates a KeyValue message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns KeyValue
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.KeyValue;

            /**
             * Creates a plain object from a KeyValue message. Also converts values to other types if specified.
             * @param message KeyValue
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.KeyValue, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this KeyValue to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace KeyValue {

            /** Properties of a KeyValue. */
            interface $Properties {

                /** KeyValue key */
                key?: (string|null);

                /** KeyValue value */
                value?: (outray.otlp.AnyValue.$Properties|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of a KeyValue. */
            type $Shape = {
              key?: string|null;
              value?: outray.otlp.AnyValue.$Shape|null;
              $unknowns?: Uint8Array[];
            };
        }

        /**
         * Properties of an InstrumentationScope.
         * @deprecated Use outray.otlp.InstrumentationScope.$Properties instead.
         */
        interface IInstrumentationScope extends outray.otlp.InstrumentationScope.$Properties {
        }

        /** Represents an InstrumentationScope. */
        class InstrumentationScope {

            /**
             * Constructs a new InstrumentationScope.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.InstrumentationScope.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** InstrumentationScope name. */
            name: string;

            /** InstrumentationScope version. */
            version: string;

            /** InstrumentationScope attributes. */
            attributes: outray.otlp.KeyValue.$Properties[];

            /** InstrumentationScope droppedAttributesCount. */
            droppedAttributesCount: number;

            /**
             * Creates a new InstrumentationScope instance using the specified properties.
             * @param [properties] Properties to set
             * @returns InstrumentationScope instance
             */
            static create(properties: outray.otlp.InstrumentationScope.$Shape): outray.otlp.InstrumentationScope & outray.otlp.InstrumentationScope.$Shape;
            static create(properties?: outray.otlp.InstrumentationScope.$Properties): outray.otlp.InstrumentationScope;

            /**
             * Encodes the specified InstrumentationScope message. Does not implicitly {@link outray.otlp.InstrumentationScope.verify|verify} messages.
             * @param message InstrumentationScope message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.InstrumentationScope.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an InstrumentationScope message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.InstrumentationScope & outray.otlp.InstrumentationScope.$Shape} InstrumentationScope
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.InstrumentationScope & outray.otlp.InstrumentationScope.$Shape;

            /**
             * Creates an InstrumentationScope message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns InstrumentationScope
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.InstrumentationScope;

            /**
             * Creates a plain object from an InstrumentationScope message. Also converts values to other types if specified.
             * @param message InstrumentationScope
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.InstrumentationScope, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this InstrumentationScope to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace InstrumentationScope {

            /** Properties of an InstrumentationScope. */
            interface $Properties {

                /** InstrumentationScope name */
                name?: (string|null);

                /** InstrumentationScope version */
                version?: (string|null);

                /** InstrumentationScope attributes */
                attributes?: (outray.otlp.KeyValue.$Properties[]|null);

                /** InstrumentationScope droppedAttributesCount */
                droppedAttributesCount?: (number|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of an InstrumentationScope. */
            type $Shape = {
              name?: string|null;
              version?: string|null;
              attributes?: outray.otlp.KeyValue.$Shape[]|null;
              droppedAttributesCount?: number|null;
              $unknowns?: Uint8Array[];
            };
        }

        /**
         * Properties of a Resource.
         * @deprecated Use outray.otlp.Resource.$Properties instead.
         */
        interface IResource extends outray.otlp.Resource.$Properties {
        }

        /** Represents a Resource. */
        class Resource {

            /**
             * Constructs a new Resource.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.Resource.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** Resource attributes. */
            attributes: outray.otlp.KeyValue.$Properties[];

            /** Resource droppedAttributesCount. */
            droppedAttributesCount: number;

            /**
             * Creates a new Resource instance using the specified properties.
             * @param [properties] Properties to set
             * @returns Resource instance
             */
            static create(properties: outray.otlp.Resource.$Shape): outray.otlp.Resource & outray.otlp.Resource.$Shape;
            static create(properties?: outray.otlp.Resource.$Properties): outray.otlp.Resource;

            /**
             * Encodes the specified Resource message. Does not implicitly {@link outray.otlp.Resource.verify|verify} messages.
             * @param message Resource message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.Resource.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a Resource message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.Resource & outray.otlp.Resource.$Shape} Resource
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.Resource & outray.otlp.Resource.$Shape;

            /**
             * Creates a Resource message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns Resource
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.Resource;

            /**
             * Creates a plain object from a Resource message. Also converts values to other types if specified.
             * @param message Resource
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.Resource, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this Resource to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace Resource {

            /** Properties of a Resource. */
            interface $Properties {

                /** Resource attributes */
                attributes?: (outray.otlp.KeyValue.$Properties[]|null);

                /** Resource droppedAttributesCount */
                droppedAttributesCount?: (number|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of a Resource. */
            type $Shape = {
              attributes?: outray.otlp.KeyValue.$Shape[]|null;
              droppedAttributesCount?: number|null;
              $unknowns?: Uint8Array[];
            };
        }

        /**
         * Properties of a ResourceSpans.
         * @deprecated Use outray.otlp.ResourceSpans.$Properties instead.
         */
        interface IResourceSpans extends outray.otlp.ResourceSpans.$Properties {
        }

        /** Represents a ResourceSpans. */
        class ResourceSpans {

            /**
             * Constructs a new ResourceSpans.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.ResourceSpans.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** ResourceSpans resource. */
            resource?: (outray.otlp.Resource.$Properties|null);

            /** ResourceSpans scopeSpans. */
            scopeSpans: outray.otlp.ScopeSpans.$Properties[];

            /** ResourceSpans schemaUrl. */
            schemaUrl: string;

            /**
             * Creates a new ResourceSpans instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ResourceSpans instance
             */
            static create(properties: outray.otlp.ResourceSpans.$Shape): outray.otlp.ResourceSpans & outray.otlp.ResourceSpans.$Shape;
            static create(properties?: outray.otlp.ResourceSpans.$Properties): outray.otlp.ResourceSpans;

            /**
             * Encodes the specified ResourceSpans message. Does not implicitly {@link outray.otlp.ResourceSpans.verify|verify} messages.
             * @param message ResourceSpans message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.ResourceSpans.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a ResourceSpans message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.ResourceSpans & outray.otlp.ResourceSpans.$Shape} ResourceSpans
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.ResourceSpans & outray.otlp.ResourceSpans.$Shape;

            /**
             * Creates a ResourceSpans message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ResourceSpans
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.ResourceSpans;

            /**
             * Creates a plain object from a ResourceSpans message. Also converts values to other types if specified.
             * @param message ResourceSpans
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.ResourceSpans, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ResourceSpans to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace ResourceSpans {

            /** Properties of a ResourceSpans. */
            interface $Properties {

                /** ResourceSpans resource */
                resource?: (outray.otlp.Resource.$Properties|null);

                /** ResourceSpans scopeSpans */
                scopeSpans?: (outray.otlp.ScopeSpans.$Properties[]|null);

                /** ResourceSpans schemaUrl */
                schemaUrl?: (string|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of a ResourceSpans. */
            type $Shape = {
              resource?: outray.otlp.Resource.$Shape|null;
              scopeSpans?: outray.otlp.ScopeSpans.$Shape[]|null;
              schemaUrl?: string|null;
              $unknowns?: Uint8Array[];
            };
        }

        /**
         * Properties of a ScopeSpans.
         * @deprecated Use outray.otlp.ScopeSpans.$Properties instead.
         */
        interface IScopeSpans extends outray.otlp.ScopeSpans.$Properties {
        }

        /** Represents a ScopeSpans. */
        class ScopeSpans {

            /**
             * Constructs a new ScopeSpans.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.ScopeSpans.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** ScopeSpans scope. */
            scope?: (outray.otlp.InstrumentationScope.$Properties|null);

            /** ScopeSpans spans. */
            spans: outray.otlp.Span.$Properties[];

            /** ScopeSpans schemaUrl. */
            schemaUrl: string;

            /**
             * Creates a new ScopeSpans instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ScopeSpans instance
             */
            static create(properties: outray.otlp.ScopeSpans.$Shape): outray.otlp.ScopeSpans & outray.otlp.ScopeSpans.$Shape;
            static create(properties?: outray.otlp.ScopeSpans.$Properties): outray.otlp.ScopeSpans;

            /**
             * Encodes the specified ScopeSpans message. Does not implicitly {@link outray.otlp.ScopeSpans.verify|verify} messages.
             * @param message ScopeSpans message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.ScopeSpans.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a ScopeSpans message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.ScopeSpans & outray.otlp.ScopeSpans.$Shape} ScopeSpans
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.ScopeSpans & outray.otlp.ScopeSpans.$Shape;

            /**
             * Creates a ScopeSpans message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ScopeSpans
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.ScopeSpans;

            /**
             * Creates a plain object from a ScopeSpans message. Also converts values to other types if specified.
             * @param message ScopeSpans
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.ScopeSpans, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ScopeSpans to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace ScopeSpans {

            /** Properties of a ScopeSpans. */
            interface $Properties {

                /** ScopeSpans scope */
                scope?: (outray.otlp.InstrumentationScope.$Properties|null);

                /** ScopeSpans spans */
                spans?: (outray.otlp.Span.$Properties[]|null);

                /** ScopeSpans schemaUrl */
                schemaUrl?: (string|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of a ScopeSpans. */
            type $Shape = {
              scope?: outray.otlp.InstrumentationScope.$Shape|null;
              spans?: outray.otlp.Span.$Shape[]|null;
              schemaUrl?: string|null;
              $unknowns?: Uint8Array[];
            };
        }

        /**
         * Properties of a Span.
         * @deprecated Use outray.otlp.Span.$Properties instead.
         */
        interface ISpan extends outray.otlp.Span.$Properties {
        }

        /** Represents a Span. */
        class Span {

            /**
             * Constructs a new Span.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.Span.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** Span traceId. */
            traceId: Uint8Array;

            /** Span spanId. */
            spanId: Uint8Array;

            /** Span traceState. */
            traceState: string;

            /** Span parentSpanId. */
            parentSpanId: Uint8Array;

            /** Span name. */
            name: string;

            /** Span kind. */
            kind: outray.otlp.Span.SpanKind;

            /** Span startTimeUnixNano. */
            startTimeUnixNano: (number|Long);

            /** Span endTimeUnixNano. */
            endTimeUnixNano: (number|Long);

            /** Span attributes. */
            attributes: outray.otlp.KeyValue.$Properties[];

            /** Span droppedAttributesCount. */
            droppedAttributesCount: number;

            /** Span events. */
            events: outray.otlp.Span.Event.$Properties[];

            /** Span droppedEventsCount. */
            droppedEventsCount: number;

            /** Span links. */
            links: outray.otlp.Span.Link.$Properties[];

            /** Span droppedLinksCount. */
            droppedLinksCount: number;

            /** Span status. */
            status?: (outray.otlp.Status.$Properties|null);

            /** Span flags. */
            flags: number;

            /**
             * Creates a new Span instance using the specified properties.
             * @param [properties] Properties to set
             * @returns Span instance
             */
            static create(properties: outray.otlp.Span.$Shape): outray.otlp.Span & outray.otlp.Span.$Shape;
            static create(properties?: outray.otlp.Span.$Properties): outray.otlp.Span;

            /**
             * Encodes the specified Span message. Does not implicitly {@link outray.otlp.Span.verify|verify} messages.
             * @param message Span message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.Span.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a Span message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.Span & outray.otlp.Span.$Shape} Span
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.Span & outray.otlp.Span.$Shape;

            /**
             * Creates a Span message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns Span
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.Span;

            /**
             * Creates a plain object from a Span message. Also converts values to other types if specified.
             * @param message Span
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.Span, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this Span to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace Span {

            /** Properties of a Span. */
            interface $Properties {

                /** Span traceId */
                traceId?: (Uint8Array|null);

                /** Span spanId */
                spanId?: (Uint8Array|null);

                /** Span traceState */
                traceState?: (string|null);

                /** Span parentSpanId */
                parentSpanId?: (Uint8Array|null);

                /** Span name */
                name?: (string|null);

                /** Span kind */
                kind?: (outray.otlp.Span.SpanKind|null);

                /** Span startTimeUnixNano */
                startTimeUnixNano?: (number|Long|null);

                /** Span endTimeUnixNano */
                endTimeUnixNano?: (number|Long|null);

                /** Span attributes */
                attributes?: (outray.otlp.KeyValue.$Properties[]|null);

                /** Span droppedAttributesCount */
                droppedAttributesCount?: (number|null);

                /** Span events */
                events?: (outray.otlp.Span.Event.$Properties[]|null);

                /** Span droppedEventsCount */
                droppedEventsCount?: (number|null);

                /** Span links */
                links?: (outray.otlp.Span.Link.$Properties[]|null);

                /** Span droppedLinksCount */
                droppedLinksCount?: (number|null);

                /** Span status */
                status?: (outray.otlp.Status.$Properties|null);

                /** Span flags */
                flags?: (number|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of a Span. */
            type $Shape = {
              traceId?: Uint8Array|null;
              spanId?: Uint8Array|null;
              traceState?: string|null;
              parentSpanId?: Uint8Array|null;
              name?: string|null;
              kind?: outray.otlp.Span.SpanKind|null;
              startTimeUnixNano?: number|Long|null;
              endTimeUnixNano?: number|Long|null;
              attributes?: outray.otlp.KeyValue.$Shape[]|null;
              droppedAttributesCount?: number|null;
              events?: outray.otlp.Span.Event.$Shape[]|null;
              droppedEventsCount?: number|null;
              links?: outray.otlp.Span.Link.$Shape[]|null;
              droppedLinksCount?: number|null;
              status?: outray.otlp.Status.$Shape|null;
              flags?: number|null;
              $unknowns?: Uint8Array[];
            };

            /** SpanKind enum. */
            enum SpanKind {

                /** SPAN_KIND_UNSPECIFIED value */
                SPAN_KIND_UNSPECIFIED = 0,

                /** SPAN_KIND_INTERNAL value */
                SPAN_KIND_INTERNAL = 1,

                /** SPAN_KIND_SERVER value */
                SPAN_KIND_SERVER = 2,

                /** SPAN_KIND_CLIENT value */
                SPAN_KIND_CLIENT = 3,

                /** SPAN_KIND_PRODUCER value */
                SPAN_KIND_PRODUCER = 4,

                /** SPAN_KIND_CONSUMER value */
                SPAN_KIND_CONSUMER = 5
            }

            /**
             * Properties of an Event.
             * @deprecated Use outray.otlp.Span.Event.$Properties instead.
             */
            interface IEvent extends outray.otlp.Span.Event.$Properties {
            }

            /** Represents an Event. */
            class Event {

                /**
                 * Constructs a new Event.
                 * @param [properties] Properties to set
                 */
                constructor(properties?: outray.otlp.Span.Event.$Properties);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];

                /** Event timeUnixNano. */
                timeUnixNano: (number|Long);

                /** Event name. */
                name: string;

                /** Event attributes. */
                attributes: outray.otlp.KeyValue.$Properties[];

                /** Event droppedAttributesCount. */
                droppedAttributesCount: number;

                /**
                 * Creates a new Event instance using the specified properties.
                 * @param [properties] Properties to set
                 * @returns Event instance
                 */
                static create(properties: outray.otlp.Span.Event.$Shape): outray.otlp.Span.Event & outray.otlp.Span.Event.$Shape;
                static create(properties?: outray.otlp.Span.Event.$Properties): outray.otlp.Span.Event;

                /**
                 * Encodes the specified Event message. Does not implicitly {@link outray.otlp.Span.Event.verify|verify} messages.
                 * @param message Event message or plain object to encode
                 * @param [writer] Writer to encode to
                 * @returns Writer
                 */
                static encode(message: outray.otlp.Span.Event.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

                /**
                 * Decodes an Event message from the specified reader or buffer.
                 * @param reader Reader or buffer to decode from
                 * @param [length] Message length if known beforehand
                 * @returns {outray.otlp.Span.Event & outray.otlp.Span.Event.$Shape} Event
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.Span.Event & outray.otlp.Span.Event.$Shape;

                /**
                 * Creates an Event message from a plain object. Also converts values to their respective internal types.
                 * @param object Plain object
                 * @returns Event
                 */
                static fromObject(object: { [k: string]: any }): outray.otlp.Span.Event;

                /**
                 * Creates a plain object from an Event message. Also converts values to other types if specified.
                 * @param message Event
                 * @param [options] Conversion options
                 * @returns Plain object
                 */
                static toObject(message: outray.otlp.Span.Event, options?: $protobuf.IConversionOptions): { [k: string]: any };

                /**
                 * Converts this Event to JSON.
                 * @returns JSON object
                 */
                toJSON(): { [k: string]: any };
            }

            namespace Event {

                /** Properties of an Event. */
                interface $Properties {

                    /** Event timeUnixNano */
                    timeUnixNano?: (number|Long|null);

                    /** Event name */
                    name?: (string|null);

                    /** Event attributes */
                    attributes?: (outray.otlp.KeyValue.$Properties[]|null);

                    /** Event droppedAttributesCount */
                    droppedAttributesCount?: (number|null);

                    /** Unknown fields preserved while decoding when enabled */
                    $unknowns?: Uint8Array[];
                }

                /** Shape of an Event. */
                type $Shape = {
                  timeUnixNano?: number|Long|null;
                  name?: string|null;
                  attributes?: outray.otlp.KeyValue.$Shape[]|null;
                  droppedAttributesCount?: number|null;
                  $unknowns?: Uint8Array[];
                };
            }

            /**
             * Properties of a Link.
             * @deprecated Use outray.otlp.Span.Link.$Properties instead.
             */
            interface ILink extends outray.otlp.Span.Link.$Properties {
            }

            /** Represents a Link. */
            class Link {

                /**
                 * Constructs a new Link.
                 * @param [properties] Properties to set
                 */
                constructor(properties?: outray.otlp.Span.Link.$Properties);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];

                /** Link traceId. */
                traceId: Uint8Array;

                /** Link spanId. */
                spanId: Uint8Array;

                /** Link traceState. */
                traceState: string;

                /** Link attributes. */
                attributes: outray.otlp.KeyValue.$Properties[];

                /** Link droppedAttributesCount. */
                droppedAttributesCount: number;

                /** Link flags. */
                flags: number;

                /**
                 * Creates a new Link instance using the specified properties.
                 * @param [properties] Properties to set
                 * @returns Link instance
                 */
                static create(properties: outray.otlp.Span.Link.$Shape): outray.otlp.Span.Link & outray.otlp.Span.Link.$Shape;
                static create(properties?: outray.otlp.Span.Link.$Properties): outray.otlp.Span.Link;

                /**
                 * Encodes the specified Link message. Does not implicitly {@link outray.otlp.Span.Link.verify|verify} messages.
                 * @param message Link message or plain object to encode
                 * @param [writer] Writer to encode to
                 * @returns Writer
                 */
                static encode(message: outray.otlp.Span.Link.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

                /**
                 * Decodes a Link message from the specified reader or buffer.
                 * @param reader Reader or buffer to decode from
                 * @param [length] Message length if known beforehand
                 * @returns {outray.otlp.Span.Link & outray.otlp.Span.Link.$Shape} Link
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.Span.Link & outray.otlp.Span.Link.$Shape;

                /**
                 * Creates a Link message from a plain object. Also converts values to their respective internal types.
                 * @param object Plain object
                 * @returns Link
                 */
                static fromObject(object: { [k: string]: any }): outray.otlp.Span.Link;

                /**
                 * Creates a plain object from a Link message. Also converts values to other types if specified.
                 * @param message Link
                 * @param [options] Conversion options
                 * @returns Plain object
                 */
                static toObject(message: outray.otlp.Span.Link, options?: $protobuf.IConversionOptions): { [k: string]: any };

                /**
                 * Converts this Link to JSON.
                 * @returns JSON object
                 */
                toJSON(): { [k: string]: any };
            }

            namespace Link {

                /** Properties of a Link. */
                interface $Properties {

                    /** Link traceId */
                    traceId?: (Uint8Array|null);

                    /** Link spanId */
                    spanId?: (Uint8Array|null);

                    /** Link traceState */
                    traceState?: (string|null);

                    /** Link attributes */
                    attributes?: (outray.otlp.KeyValue.$Properties[]|null);

                    /** Link droppedAttributesCount */
                    droppedAttributesCount?: (number|null);

                    /** Link flags */
                    flags?: (number|null);

                    /** Unknown fields preserved while decoding when enabled */
                    $unknowns?: Uint8Array[];
                }

                /** Shape of a Link. */
                type $Shape = {
                  traceId?: Uint8Array|null;
                  spanId?: Uint8Array|null;
                  traceState?: string|null;
                  attributes?: outray.otlp.KeyValue.$Shape[]|null;
                  droppedAttributesCount?: number|null;
                  flags?: number|null;
                  $unknowns?: Uint8Array[];
                };
            }
        }

        /**
         * Properties of a Status.
         * @deprecated Use outray.otlp.Status.$Properties instead.
         */
        interface IStatus extends outray.otlp.Status.$Properties {
        }

        /** Represents a Status. */
        class Status {

            /**
             * Constructs a new Status.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.Status.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** Status message. */
            message: string;

            /** Status code. */
            code: outray.otlp.Status.StatusCode;

            /**
             * Creates a new Status instance using the specified properties.
             * @param [properties] Properties to set
             * @returns Status instance
             */
            static create(properties: outray.otlp.Status.$Shape): outray.otlp.Status & outray.otlp.Status.$Shape;
            static create(properties?: outray.otlp.Status.$Properties): outray.otlp.Status;

            /**
             * Encodes the specified Status message. Does not implicitly {@link outray.otlp.Status.verify|verify} messages.
             * @param message Status message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.Status.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a Status message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.Status & outray.otlp.Status.$Shape} Status
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.Status & outray.otlp.Status.$Shape;

            /**
             * Creates a Status message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns Status
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.Status;

            /**
             * Creates a plain object from a Status message. Also converts values to other types if specified.
             * @param message Status
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.Status, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this Status to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace Status {

            /** Properties of a Status. */
            interface $Properties {

                /** Status message */
                message?: (string|null);

                /** Status code */
                code?: (outray.otlp.Status.StatusCode|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of a Status. */
            type $Shape = outray.otlp.Status.$Properties;

            /** StatusCode enum. */
            enum StatusCode {

                /** STATUS_CODE_UNSET value */
                STATUS_CODE_UNSET = 0,

                /** STATUS_CODE_OK value */
                STATUS_CODE_OK = 1,

                /** STATUS_CODE_ERROR value */
                STATUS_CODE_ERROR = 2
            }
        }

        /**
         * Properties of an ExportTraceServiceRequest.
         * @deprecated Use outray.otlp.ExportTraceServiceRequest.$Properties instead.
         */
        interface IExportTraceServiceRequest extends outray.otlp.ExportTraceServiceRequest.$Properties {
        }

        /** Represents an ExportTraceServiceRequest. */
        class ExportTraceServiceRequest {

            /**
             * Constructs a new ExportTraceServiceRequest.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.ExportTraceServiceRequest.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** ExportTraceServiceRequest resourceSpans. */
            resourceSpans: outray.otlp.ResourceSpans.$Properties[];

            /**
             * Creates a new ExportTraceServiceRequest instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ExportTraceServiceRequest instance
             */
            static create(properties: outray.otlp.ExportTraceServiceRequest.$Shape): outray.otlp.ExportTraceServiceRequest & outray.otlp.ExportTraceServiceRequest.$Shape;
            static create(properties?: outray.otlp.ExportTraceServiceRequest.$Properties): outray.otlp.ExportTraceServiceRequest;

            /**
             * Encodes the specified ExportTraceServiceRequest message. Does not implicitly {@link outray.otlp.ExportTraceServiceRequest.verify|verify} messages.
             * @param message ExportTraceServiceRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.ExportTraceServiceRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an ExportTraceServiceRequest message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.ExportTraceServiceRequest & outray.otlp.ExportTraceServiceRequest.$Shape} ExportTraceServiceRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.ExportTraceServiceRequest & outray.otlp.ExportTraceServiceRequest.$Shape;

            /**
             * Creates an ExportTraceServiceRequest message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ExportTraceServiceRequest
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.ExportTraceServiceRequest;

            /**
             * Creates a plain object from an ExportTraceServiceRequest message. Also converts values to other types if specified.
             * @param message ExportTraceServiceRequest
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.ExportTraceServiceRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ExportTraceServiceRequest to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace ExportTraceServiceRequest {

            /** Properties of an ExportTraceServiceRequest. */
            interface $Properties {

                /** ExportTraceServiceRequest resourceSpans */
                resourceSpans?: (outray.otlp.ResourceSpans.$Properties[]|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of an ExportTraceServiceRequest. */
            type $Shape = {
              resourceSpans?: outray.otlp.ResourceSpans.$Shape[]|null;
              $unknowns?: Uint8Array[];
            };
        }

        /**
         * Properties of an ExportTraceServiceResponse.
         * @deprecated Use outray.otlp.ExportTraceServiceResponse.$Properties instead.
         */
        interface IExportTraceServiceResponse extends outray.otlp.ExportTraceServiceResponse.$Properties {
        }

        /** Represents an ExportTraceServiceResponse. */
        class ExportTraceServiceResponse {

            /**
             * Constructs a new ExportTraceServiceResponse.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.ExportTraceServiceResponse.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** ExportTraceServiceResponse partialSuccess. */
            partialSuccess?: (outray.otlp.ExportTracePartialSuccess.$Properties|null);

            /**
             * Creates a new ExportTraceServiceResponse instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ExportTraceServiceResponse instance
             */
            static create(properties: outray.otlp.ExportTraceServiceResponse.$Shape): outray.otlp.ExportTraceServiceResponse & outray.otlp.ExportTraceServiceResponse.$Shape;
            static create(properties?: outray.otlp.ExportTraceServiceResponse.$Properties): outray.otlp.ExportTraceServiceResponse;

            /**
             * Encodes the specified ExportTraceServiceResponse message. Does not implicitly {@link outray.otlp.ExportTraceServiceResponse.verify|verify} messages.
             * @param message ExportTraceServiceResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.ExportTraceServiceResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an ExportTraceServiceResponse message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.ExportTraceServiceResponse & outray.otlp.ExportTraceServiceResponse.$Shape} ExportTraceServiceResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.ExportTraceServiceResponse & outray.otlp.ExportTraceServiceResponse.$Shape;

            /**
             * Creates an ExportTraceServiceResponse message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ExportTraceServiceResponse
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.ExportTraceServiceResponse;

            /**
             * Creates a plain object from an ExportTraceServiceResponse message. Also converts values to other types if specified.
             * @param message ExportTraceServiceResponse
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.ExportTraceServiceResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ExportTraceServiceResponse to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace ExportTraceServiceResponse {

            /** Properties of an ExportTraceServiceResponse. */
            interface $Properties {

                /** ExportTraceServiceResponse partialSuccess */
                partialSuccess?: (outray.otlp.ExportTracePartialSuccess.$Properties|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of an ExportTraceServiceResponse. */
            type $Shape = outray.otlp.ExportTraceServiceResponse.$Properties;
        }

        /**
         * Properties of an ExportTracePartialSuccess.
         * @deprecated Use outray.otlp.ExportTracePartialSuccess.$Properties instead.
         */
        interface IExportTracePartialSuccess extends outray.otlp.ExportTracePartialSuccess.$Properties {
        }

        /** Represents an ExportTracePartialSuccess. */
        class ExportTracePartialSuccess {

            /**
             * Constructs a new ExportTracePartialSuccess.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.ExportTracePartialSuccess.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** ExportTracePartialSuccess rejectedSpans. */
            rejectedSpans: (number|Long);

            /** ExportTracePartialSuccess errorMessage. */
            errorMessage: string;

            /**
             * Creates a new ExportTracePartialSuccess instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ExportTracePartialSuccess instance
             */
            static create(properties: outray.otlp.ExportTracePartialSuccess.$Shape): outray.otlp.ExportTracePartialSuccess & outray.otlp.ExportTracePartialSuccess.$Shape;
            static create(properties?: outray.otlp.ExportTracePartialSuccess.$Properties): outray.otlp.ExportTracePartialSuccess;

            /**
             * Encodes the specified ExportTracePartialSuccess message. Does not implicitly {@link outray.otlp.ExportTracePartialSuccess.verify|verify} messages.
             * @param message ExportTracePartialSuccess message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.ExportTracePartialSuccess.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an ExportTracePartialSuccess message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.ExportTracePartialSuccess & outray.otlp.ExportTracePartialSuccess.$Shape} ExportTracePartialSuccess
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.ExportTracePartialSuccess & outray.otlp.ExportTracePartialSuccess.$Shape;

            /**
             * Creates an ExportTracePartialSuccess message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ExportTracePartialSuccess
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.ExportTracePartialSuccess;

            /**
             * Creates a plain object from an ExportTracePartialSuccess message. Also converts values to other types if specified.
             * @param message ExportTracePartialSuccess
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.ExportTracePartialSuccess, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ExportTracePartialSuccess to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace ExportTracePartialSuccess {

            /** Properties of an ExportTracePartialSuccess. */
            interface $Properties {

                /** ExportTracePartialSuccess rejectedSpans */
                rejectedSpans?: (number|Long|null);

                /** ExportTracePartialSuccess errorMessage */
                errorMessage?: (string|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of an ExportTracePartialSuccess. */
            type $Shape = outray.otlp.ExportTracePartialSuccess.$Properties;
        }

        /**
         * Properties of a ResourceLogs.
         * @deprecated Use outray.otlp.ResourceLogs.$Properties instead.
         */
        interface IResourceLogs extends outray.otlp.ResourceLogs.$Properties {
        }

        /** Represents a ResourceLogs. */
        class ResourceLogs {

            /**
             * Constructs a new ResourceLogs.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.ResourceLogs.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** ResourceLogs resource. */
            resource?: (outray.otlp.Resource.$Properties|null);

            /** ResourceLogs scopeLogs. */
            scopeLogs: outray.otlp.ScopeLogs.$Properties[];

            /** ResourceLogs schemaUrl. */
            schemaUrl: string;

            /**
             * Creates a new ResourceLogs instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ResourceLogs instance
             */
            static create(properties: outray.otlp.ResourceLogs.$Shape): outray.otlp.ResourceLogs & outray.otlp.ResourceLogs.$Shape;
            static create(properties?: outray.otlp.ResourceLogs.$Properties): outray.otlp.ResourceLogs;

            /**
             * Encodes the specified ResourceLogs message. Does not implicitly {@link outray.otlp.ResourceLogs.verify|verify} messages.
             * @param message ResourceLogs message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.ResourceLogs.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a ResourceLogs message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.ResourceLogs & outray.otlp.ResourceLogs.$Shape} ResourceLogs
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.ResourceLogs & outray.otlp.ResourceLogs.$Shape;

            /**
             * Creates a ResourceLogs message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ResourceLogs
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.ResourceLogs;

            /**
             * Creates a plain object from a ResourceLogs message. Also converts values to other types if specified.
             * @param message ResourceLogs
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.ResourceLogs, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ResourceLogs to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace ResourceLogs {

            /** Properties of a ResourceLogs. */
            interface $Properties {

                /** ResourceLogs resource */
                resource?: (outray.otlp.Resource.$Properties|null);

                /** ResourceLogs scopeLogs */
                scopeLogs?: (outray.otlp.ScopeLogs.$Properties[]|null);

                /** ResourceLogs schemaUrl */
                schemaUrl?: (string|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of a ResourceLogs. */
            type $Shape = {
              resource?: outray.otlp.Resource.$Shape|null;
              scopeLogs?: outray.otlp.ScopeLogs.$Shape[]|null;
              schemaUrl?: string|null;
              $unknowns?: Uint8Array[];
            };
        }

        /**
         * Properties of a ScopeLogs.
         * @deprecated Use outray.otlp.ScopeLogs.$Properties instead.
         */
        interface IScopeLogs extends outray.otlp.ScopeLogs.$Properties {
        }

        /** Represents a ScopeLogs. */
        class ScopeLogs {

            /**
             * Constructs a new ScopeLogs.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.ScopeLogs.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** ScopeLogs scope. */
            scope?: (outray.otlp.InstrumentationScope.$Properties|null);

            /** ScopeLogs logRecords. */
            logRecords: outray.otlp.LogRecord.$Properties[];

            /** ScopeLogs schemaUrl. */
            schemaUrl: string;

            /**
             * Creates a new ScopeLogs instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ScopeLogs instance
             */
            static create(properties: outray.otlp.ScopeLogs.$Shape): outray.otlp.ScopeLogs & outray.otlp.ScopeLogs.$Shape;
            static create(properties?: outray.otlp.ScopeLogs.$Properties): outray.otlp.ScopeLogs;

            /**
             * Encodes the specified ScopeLogs message. Does not implicitly {@link outray.otlp.ScopeLogs.verify|verify} messages.
             * @param message ScopeLogs message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.ScopeLogs.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a ScopeLogs message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.ScopeLogs & outray.otlp.ScopeLogs.$Shape} ScopeLogs
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.ScopeLogs & outray.otlp.ScopeLogs.$Shape;

            /**
             * Creates a ScopeLogs message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ScopeLogs
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.ScopeLogs;

            /**
             * Creates a plain object from a ScopeLogs message. Also converts values to other types if specified.
             * @param message ScopeLogs
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.ScopeLogs, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ScopeLogs to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace ScopeLogs {

            /** Properties of a ScopeLogs. */
            interface $Properties {

                /** ScopeLogs scope */
                scope?: (outray.otlp.InstrumentationScope.$Properties|null);

                /** ScopeLogs logRecords */
                logRecords?: (outray.otlp.LogRecord.$Properties[]|null);

                /** ScopeLogs schemaUrl */
                schemaUrl?: (string|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of a ScopeLogs. */
            type $Shape = {
              scope?: outray.otlp.InstrumentationScope.$Shape|null;
              logRecords?: outray.otlp.LogRecord.$Shape[]|null;
              schemaUrl?: string|null;
              $unknowns?: Uint8Array[];
            };
        }

        /**
         * Properties of a LogRecord.
         * @deprecated Use outray.otlp.LogRecord.$Properties instead.
         */
        interface ILogRecord extends outray.otlp.LogRecord.$Properties {
        }

        /** Represents a LogRecord. */
        class LogRecord {

            /**
             * Constructs a new LogRecord.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.LogRecord.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** LogRecord timeUnixNano. */
            timeUnixNano: (number|Long);

            /** LogRecord severityNumber. */
            severityNumber: number;

            /** LogRecord severityText. */
            severityText: string;

            /** LogRecord body. */
            body?: (outray.otlp.AnyValue.$Properties|null);

            /** LogRecord attributes. */
            attributes: outray.otlp.KeyValue.$Properties[];

            /** LogRecord droppedAttributesCount. */
            droppedAttributesCount: number;

            /** LogRecord flags. */
            flags: number;

            /** LogRecord traceId. */
            traceId: Uint8Array;

            /** LogRecord spanId. */
            spanId: Uint8Array;

            /** LogRecord observedTimeUnixNano. */
            observedTimeUnixNano: (number|Long);

            /** LogRecord eventName. */
            eventName: string;

            /**
             * Creates a new LogRecord instance using the specified properties.
             * @param [properties] Properties to set
             * @returns LogRecord instance
             */
            static create(properties: outray.otlp.LogRecord.$Shape): outray.otlp.LogRecord & outray.otlp.LogRecord.$Shape;
            static create(properties?: outray.otlp.LogRecord.$Properties): outray.otlp.LogRecord;

            /**
             * Encodes the specified LogRecord message. Does not implicitly {@link outray.otlp.LogRecord.verify|verify} messages.
             * @param message LogRecord message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.LogRecord.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a LogRecord message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.LogRecord & outray.otlp.LogRecord.$Shape} LogRecord
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.LogRecord & outray.otlp.LogRecord.$Shape;

            /**
             * Creates a LogRecord message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns LogRecord
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.LogRecord;

            /**
             * Creates a plain object from a LogRecord message. Also converts values to other types if specified.
             * @param message LogRecord
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.LogRecord, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this LogRecord to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace LogRecord {

            /** Properties of a LogRecord. */
            interface $Properties {

                /** LogRecord timeUnixNano */
                timeUnixNano?: (number|Long|null);

                /** LogRecord severityNumber */
                severityNumber?: (number|null);

                /** LogRecord severityText */
                severityText?: (string|null);

                /** LogRecord body */
                body?: (outray.otlp.AnyValue.$Properties|null);

                /** LogRecord attributes */
                attributes?: (outray.otlp.KeyValue.$Properties[]|null);

                /** LogRecord droppedAttributesCount */
                droppedAttributesCount?: (number|null);

                /** LogRecord flags */
                flags?: (number|null);

                /** LogRecord traceId */
                traceId?: (Uint8Array|null);

                /** LogRecord spanId */
                spanId?: (Uint8Array|null);

                /** LogRecord observedTimeUnixNano */
                observedTimeUnixNano?: (number|Long|null);

                /** LogRecord eventName */
                eventName?: (string|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of a LogRecord. */
            type $Shape = {
              timeUnixNano?: number|Long|null;
              severityNumber?: number|null;
              severityText?: string|null;
              body?: outray.otlp.AnyValue.$Shape|null;
              attributes?: outray.otlp.KeyValue.$Shape[]|null;
              droppedAttributesCount?: number|null;
              flags?: number|null;
              traceId?: Uint8Array|null;
              spanId?: Uint8Array|null;
              observedTimeUnixNano?: number|Long|null;
              eventName?: string|null;
              $unknowns?: Uint8Array[];
            };
        }

        /**
         * Properties of an ExportLogsServiceRequest.
         * @deprecated Use outray.otlp.ExportLogsServiceRequest.$Properties instead.
         */
        interface IExportLogsServiceRequest extends outray.otlp.ExportLogsServiceRequest.$Properties {
        }

        /** Represents an ExportLogsServiceRequest. */
        class ExportLogsServiceRequest {

            /**
             * Constructs a new ExportLogsServiceRequest.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.ExportLogsServiceRequest.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** ExportLogsServiceRequest resourceLogs. */
            resourceLogs: outray.otlp.ResourceLogs.$Properties[];

            /**
             * Creates a new ExportLogsServiceRequest instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ExportLogsServiceRequest instance
             */
            static create(properties: outray.otlp.ExportLogsServiceRequest.$Shape): outray.otlp.ExportLogsServiceRequest & outray.otlp.ExportLogsServiceRequest.$Shape;
            static create(properties?: outray.otlp.ExportLogsServiceRequest.$Properties): outray.otlp.ExportLogsServiceRequest;

            /**
             * Encodes the specified ExportLogsServiceRequest message. Does not implicitly {@link outray.otlp.ExportLogsServiceRequest.verify|verify} messages.
             * @param message ExportLogsServiceRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.ExportLogsServiceRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an ExportLogsServiceRequest message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.ExportLogsServiceRequest & outray.otlp.ExportLogsServiceRequest.$Shape} ExportLogsServiceRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.ExportLogsServiceRequest & outray.otlp.ExportLogsServiceRequest.$Shape;

            /**
             * Creates an ExportLogsServiceRequest message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ExportLogsServiceRequest
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.ExportLogsServiceRequest;

            /**
             * Creates a plain object from an ExportLogsServiceRequest message. Also converts values to other types if specified.
             * @param message ExportLogsServiceRequest
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.ExportLogsServiceRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ExportLogsServiceRequest to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace ExportLogsServiceRequest {

            /** Properties of an ExportLogsServiceRequest. */
            interface $Properties {

                /** ExportLogsServiceRequest resourceLogs */
                resourceLogs?: (outray.otlp.ResourceLogs.$Properties[]|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of an ExportLogsServiceRequest. */
            type $Shape = {
              resourceLogs?: outray.otlp.ResourceLogs.$Shape[]|null;
              $unknowns?: Uint8Array[];
            };
        }

        /**
         * Properties of an ExportLogsServiceResponse.
         * @deprecated Use outray.otlp.ExportLogsServiceResponse.$Properties instead.
         */
        interface IExportLogsServiceResponse extends outray.otlp.ExportLogsServiceResponse.$Properties {
        }

        /** Represents an ExportLogsServiceResponse. */
        class ExportLogsServiceResponse {

            /**
             * Constructs a new ExportLogsServiceResponse.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.ExportLogsServiceResponse.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** ExportLogsServiceResponse partialSuccess. */
            partialSuccess?: (outray.otlp.ExportLogsPartialSuccess.$Properties|null);

            /**
             * Creates a new ExportLogsServiceResponse instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ExportLogsServiceResponse instance
             */
            static create(properties: outray.otlp.ExportLogsServiceResponse.$Shape): outray.otlp.ExportLogsServiceResponse & outray.otlp.ExportLogsServiceResponse.$Shape;
            static create(properties?: outray.otlp.ExportLogsServiceResponse.$Properties): outray.otlp.ExportLogsServiceResponse;

            /**
             * Encodes the specified ExportLogsServiceResponse message. Does not implicitly {@link outray.otlp.ExportLogsServiceResponse.verify|verify} messages.
             * @param message ExportLogsServiceResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.ExportLogsServiceResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an ExportLogsServiceResponse message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.ExportLogsServiceResponse & outray.otlp.ExportLogsServiceResponse.$Shape} ExportLogsServiceResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.ExportLogsServiceResponse & outray.otlp.ExportLogsServiceResponse.$Shape;

            /**
             * Creates an ExportLogsServiceResponse message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ExportLogsServiceResponse
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.ExportLogsServiceResponse;

            /**
             * Creates a plain object from an ExportLogsServiceResponse message. Also converts values to other types if specified.
             * @param message ExportLogsServiceResponse
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.ExportLogsServiceResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ExportLogsServiceResponse to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace ExportLogsServiceResponse {

            /** Properties of an ExportLogsServiceResponse. */
            interface $Properties {

                /** ExportLogsServiceResponse partialSuccess */
                partialSuccess?: (outray.otlp.ExportLogsPartialSuccess.$Properties|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of an ExportLogsServiceResponse. */
            type $Shape = outray.otlp.ExportLogsServiceResponse.$Properties;
        }

        /**
         * Properties of an ExportLogsPartialSuccess.
         * @deprecated Use outray.otlp.ExportLogsPartialSuccess.$Properties instead.
         */
        interface IExportLogsPartialSuccess extends outray.otlp.ExportLogsPartialSuccess.$Properties {
        }

        /** Represents an ExportLogsPartialSuccess. */
        class ExportLogsPartialSuccess {

            /**
             * Constructs a new ExportLogsPartialSuccess.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.ExportLogsPartialSuccess.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** ExportLogsPartialSuccess rejectedLogRecords. */
            rejectedLogRecords: (number|Long);

            /** ExportLogsPartialSuccess errorMessage. */
            errorMessage: string;

            /**
             * Creates a new ExportLogsPartialSuccess instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ExportLogsPartialSuccess instance
             */
            static create(properties: outray.otlp.ExportLogsPartialSuccess.$Shape): outray.otlp.ExportLogsPartialSuccess & outray.otlp.ExportLogsPartialSuccess.$Shape;
            static create(properties?: outray.otlp.ExportLogsPartialSuccess.$Properties): outray.otlp.ExportLogsPartialSuccess;

            /**
             * Encodes the specified ExportLogsPartialSuccess message. Does not implicitly {@link outray.otlp.ExportLogsPartialSuccess.verify|verify} messages.
             * @param message ExportLogsPartialSuccess message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.ExportLogsPartialSuccess.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an ExportLogsPartialSuccess message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.ExportLogsPartialSuccess & outray.otlp.ExportLogsPartialSuccess.$Shape} ExportLogsPartialSuccess
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.ExportLogsPartialSuccess & outray.otlp.ExportLogsPartialSuccess.$Shape;

            /**
             * Creates an ExportLogsPartialSuccess message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ExportLogsPartialSuccess
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.ExportLogsPartialSuccess;

            /**
             * Creates a plain object from an ExportLogsPartialSuccess message. Also converts values to other types if specified.
             * @param message ExportLogsPartialSuccess
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.ExportLogsPartialSuccess, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ExportLogsPartialSuccess to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace ExportLogsPartialSuccess {

            /** Properties of an ExportLogsPartialSuccess. */
            interface $Properties {

                /** ExportLogsPartialSuccess rejectedLogRecords */
                rejectedLogRecords?: (number|Long|null);

                /** ExportLogsPartialSuccess errorMessage */
                errorMessage?: (string|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of an ExportLogsPartialSuccess. */
            type $Shape = outray.otlp.ExportLogsPartialSuccess.$Properties;
        }

        /**
         * Properties of a ResourceMetrics.
         * @deprecated Use outray.otlp.ResourceMetrics.$Properties instead.
         */
        interface IResourceMetrics extends outray.otlp.ResourceMetrics.$Properties {
        }

        /** Represents a ResourceMetrics. */
        class ResourceMetrics {

            /**
             * Constructs a new ResourceMetrics.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.ResourceMetrics.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** ResourceMetrics resource. */
            resource?: (outray.otlp.Resource.$Properties|null);

            /** ResourceMetrics scopeMetrics. */
            scopeMetrics: outray.otlp.ScopeMetrics.$Properties[];

            /** ResourceMetrics schemaUrl. */
            schemaUrl: string;

            /**
             * Creates a new ResourceMetrics instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ResourceMetrics instance
             */
            static create(properties: outray.otlp.ResourceMetrics.$Shape): outray.otlp.ResourceMetrics & outray.otlp.ResourceMetrics.$Shape;
            static create(properties?: outray.otlp.ResourceMetrics.$Properties): outray.otlp.ResourceMetrics;

            /**
             * Encodes the specified ResourceMetrics message. Does not implicitly {@link outray.otlp.ResourceMetrics.verify|verify} messages.
             * @param message ResourceMetrics message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.ResourceMetrics.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a ResourceMetrics message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.ResourceMetrics & outray.otlp.ResourceMetrics.$Shape} ResourceMetrics
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.ResourceMetrics & outray.otlp.ResourceMetrics.$Shape;

            /**
             * Creates a ResourceMetrics message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ResourceMetrics
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.ResourceMetrics;

            /**
             * Creates a plain object from a ResourceMetrics message. Also converts values to other types if specified.
             * @param message ResourceMetrics
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.ResourceMetrics, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ResourceMetrics to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace ResourceMetrics {

            /** Properties of a ResourceMetrics. */
            interface $Properties {

                /** ResourceMetrics resource */
                resource?: (outray.otlp.Resource.$Properties|null);

                /** ResourceMetrics scopeMetrics */
                scopeMetrics?: (outray.otlp.ScopeMetrics.$Properties[]|null);

                /** ResourceMetrics schemaUrl */
                schemaUrl?: (string|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of a ResourceMetrics. */
            type $Shape = {
              resource?: outray.otlp.Resource.$Shape|null;
              scopeMetrics?: outray.otlp.ScopeMetrics.$Shape[]|null;
              schemaUrl?: string|null;
              $unknowns?: Uint8Array[];
            };
        }

        /**
         * Properties of a ScopeMetrics.
         * @deprecated Use outray.otlp.ScopeMetrics.$Properties instead.
         */
        interface IScopeMetrics extends outray.otlp.ScopeMetrics.$Properties {
        }

        /** Represents a ScopeMetrics. */
        class ScopeMetrics {

            /**
             * Constructs a new ScopeMetrics.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.ScopeMetrics.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** ScopeMetrics scope. */
            scope?: (outray.otlp.InstrumentationScope.$Properties|null);

            /** ScopeMetrics metrics. */
            metrics: outray.otlp.Metric.$Properties[];

            /** ScopeMetrics schemaUrl. */
            schemaUrl: string;

            /**
             * Creates a new ScopeMetrics instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ScopeMetrics instance
             */
            static create(properties: outray.otlp.ScopeMetrics.$Shape): outray.otlp.ScopeMetrics & outray.otlp.ScopeMetrics.$Shape;
            static create(properties?: outray.otlp.ScopeMetrics.$Properties): outray.otlp.ScopeMetrics;

            /**
             * Encodes the specified ScopeMetrics message. Does not implicitly {@link outray.otlp.ScopeMetrics.verify|verify} messages.
             * @param message ScopeMetrics message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.ScopeMetrics.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a ScopeMetrics message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.ScopeMetrics & outray.otlp.ScopeMetrics.$Shape} ScopeMetrics
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.ScopeMetrics & outray.otlp.ScopeMetrics.$Shape;

            /**
             * Creates a ScopeMetrics message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ScopeMetrics
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.ScopeMetrics;

            /**
             * Creates a plain object from a ScopeMetrics message. Also converts values to other types if specified.
             * @param message ScopeMetrics
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.ScopeMetrics, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ScopeMetrics to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace ScopeMetrics {

            /** Properties of a ScopeMetrics. */
            interface $Properties {

                /** ScopeMetrics scope */
                scope?: (outray.otlp.InstrumentationScope.$Properties|null);

                /** ScopeMetrics metrics */
                metrics?: (outray.otlp.Metric.$Properties[]|null);

                /** ScopeMetrics schemaUrl */
                schemaUrl?: (string|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of a ScopeMetrics. */
            type $Shape = {
              scope?: outray.otlp.InstrumentationScope.$Shape|null;
              metrics?: outray.otlp.Metric.$Shape[]|null;
              schemaUrl?: string|null;
              $unknowns?: Uint8Array[];
            };
        }

        /**
         * Properties of a Metric.
         * @deprecated Use outray.otlp.Metric.$Properties instead.
         */
        interface IMetric extends outray.otlp.Metric.$Properties {
        }

        /** Represents a Metric. */
        class Metric {

            /**
             * Constructs a new Metric.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.Metric.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** Metric name. */
            name: string;

            /** Metric description. */
            description: string;

            /** Metric unit. */
            unit: string;

            /** Metric gauge. */
            gauge?: (outray.otlp.Gauge.$Properties|null);

            /** Metric sum. */
            sum?: (outray.otlp.Sum.$Properties|null);

            /** Metric histogram. */
            histogram?: (outray.otlp.Histogram.$Properties|null);

            /** Metric exponentialHistogram. */
            exponentialHistogram?: (outray.otlp.ExponentialHistogram.$Properties|null);

            /** Metric summary. */
            summary?: (outray.otlp.Summary.$Properties|null);

            /** Metric metadata. */
            metadata: outray.otlp.KeyValue.$Properties[];

            /** Metric data. */
            data?: ("gauge"|"sum"|"histogram"|"exponentialHistogram"|"summary");

            /**
             * Creates a new Metric instance using the specified properties.
             * @param [properties] Properties to set
             * @returns Metric instance
             */
            static create(properties: outray.otlp.Metric.$Shape): outray.otlp.Metric & outray.otlp.Metric.$Shape;
            static create(properties?: outray.otlp.Metric.$Properties): outray.otlp.Metric;

            /**
             * Encodes the specified Metric message. Does not implicitly {@link outray.otlp.Metric.verify|verify} messages.
             * @param message Metric message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.Metric.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a Metric message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.Metric & outray.otlp.Metric.$Shape} Metric
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.Metric & outray.otlp.Metric.$Shape;

            /**
             * Creates a Metric message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns Metric
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.Metric;

            /**
             * Creates a plain object from a Metric message. Also converts values to other types if specified.
             * @param message Metric
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.Metric, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this Metric to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace Metric {

            /** Properties of a Metric. */
            interface $Properties {

                /** Metric name */
                name?: (string|null);

                /** Metric description */
                description?: (string|null);

                /** Metric unit */
                unit?: (string|null);

                /** Metric gauge */
                gauge?: (outray.otlp.Gauge.$Properties|null);

                /** Metric sum */
                sum?: (outray.otlp.Sum.$Properties|null);

                /** Metric histogram */
                histogram?: (outray.otlp.Histogram.$Properties|null);

                /** Metric exponentialHistogram */
                exponentialHistogram?: (outray.otlp.ExponentialHistogram.$Properties|null);

                /** Metric summary */
                summary?: (outray.otlp.Summary.$Properties|null);

                /** Metric metadata */
                metadata?: (outray.otlp.KeyValue.$Properties[]|null);

                /** Metric data */
                data?: ("gauge"|"sum"|"histogram"|"exponentialHistogram"|"summary");

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Narrowed shape of a Metric. */
            type $Shape = {
              name?: string|null;
              description?: string|null;
              unit?: string|null;
              gauge?: outray.otlp.Gauge.$Shape|null;
              sum?: outray.otlp.Sum.$Shape|null;
              histogram?: outray.otlp.Histogram.$Shape|null;
              exponentialHistogram?: outray.otlp.ExponentialHistogram.$Shape|null;
              summary?: outray.otlp.Summary.$Shape|null;
              metadata?: outray.otlp.KeyValue.$Shape[]|null;
              $unknowns?: Uint8Array[];
            } & (
              ({ data?: undefined; gauge?: null; sum?: null; histogram?: null; exponentialHistogram?: null; summary?: null }|{ data?: "gauge"; gauge: outray.otlp.Gauge.$Shape; sum?: null; histogram?: null; exponentialHistogram?: null; summary?: null }|{ data?: "sum"; gauge?: null; sum: outray.otlp.Sum.$Shape; histogram?: null; exponentialHistogram?: null; summary?: null }|{ data?: "histogram"; gauge?: null; sum?: null; histogram: outray.otlp.Histogram.$Shape; exponentialHistogram?: null; summary?: null }|{ data?: "exponentialHistogram"; gauge?: null; sum?: null; histogram?: null; exponentialHistogram: outray.otlp.ExponentialHistogram.$Shape; summary?: null }|{ data?: "summary"; gauge?: null; sum?: null; histogram?: null; exponentialHistogram?: null; summary: outray.otlp.Summary.$Shape })
            );
        }

        /**
         * Properties of a Gauge.
         * @deprecated Use outray.otlp.Gauge.$Properties instead.
         */
        interface IGauge extends outray.otlp.Gauge.$Properties {
        }

        /** Represents a Gauge. */
        class Gauge {

            /**
             * Constructs a new Gauge.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.Gauge.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** Gauge dataPoints. */
            dataPoints: outray.otlp.NumberDataPoint.$Properties[];

            /**
             * Creates a new Gauge instance using the specified properties.
             * @param [properties] Properties to set
             * @returns Gauge instance
             */
            static create(properties: outray.otlp.Gauge.$Shape): outray.otlp.Gauge & outray.otlp.Gauge.$Shape;
            static create(properties?: outray.otlp.Gauge.$Properties): outray.otlp.Gauge;

            /**
             * Encodes the specified Gauge message. Does not implicitly {@link outray.otlp.Gauge.verify|verify} messages.
             * @param message Gauge message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.Gauge.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a Gauge message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.Gauge & outray.otlp.Gauge.$Shape} Gauge
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.Gauge & outray.otlp.Gauge.$Shape;

            /**
             * Creates a Gauge message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns Gauge
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.Gauge;

            /**
             * Creates a plain object from a Gauge message. Also converts values to other types if specified.
             * @param message Gauge
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.Gauge, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this Gauge to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace Gauge {

            /** Properties of a Gauge. */
            interface $Properties {

                /** Gauge dataPoints */
                dataPoints?: (outray.otlp.NumberDataPoint.$Properties[]|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of a Gauge. */
            type $Shape = {
              dataPoints?: outray.otlp.NumberDataPoint.$Shape[]|null;
              $unknowns?: Uint8Array[];
            };
        }

        /**
         * Properties of a Sum.
         * @deprecated Use outray.otlp.Sum.$Properties instead.
         */
        interface ISum extends outray.otlp.Sum.$Properties {
        }

        /** Represents a Sum. */
        class Sum {

            /**
             * Constructs a new Sum.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.Sum.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** Sum dataPoints. */
            dataPoints: outray.otlp.NumberDataPoint.$Properties[];

            /** Sum aggregationTemporality. */
            aggregationTemporality: outray.otlp.AggregationTemporality;

            /** Sum isMonotonic. */
            isMonotonic: boolean;

            /**
             * Creates a new Sum instance using the specified properties.
             * @param [properties] Properties to set
             * @returns Sum instance
             */
            static create(properties: outray.otlp.Sum.$Shape): outray.otlp.Sum & outray.otlp.Sum.$Shape;
            static create(properties?: outray.otlp.Sum.$Properties): outray.otlp.Sum;

            /**
             * Encodes the specified Sum message. Does not implicitly {@link outray.otlp.Sum.verify|verify} messages.
             * @param message Sum message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.Sum.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a Sum message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.Sum & outray.otlp.Sum.$Shape} Sum
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.Sum & outray.otlp.Sum.$Shape;

            /**
             * Creates a Sum message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns Sum
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.Sum;

            /**
             * Creates a plain object from a Sum message. Also converts values to other types if specified.
             * @param message Sum
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.Sum, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this Sum to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace Sum {

            /** Properties of a Sum. */
            interface $Properties {

                /** Sum dataPoints */
                dataPoints?: (outray.otlp.NumberDataPoint.$Properties[]|null);

                /** Sum aggregationTemporality */
                aggregationTemporality?: (outray.otlp.AggregationTemporality|null);

                /** Sum isMonotonic */
                isMonotonic?: (boolean|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of a Sum. */
            type $Shape = {
              dataPoints?: outray.otlp.NumberDataPoint.$Shape[]|null;
              aggregationTemporality?: outray.otlp.AggregationTemporality|null;
              isMonotonic?: boolean|null;
              $unknowns?: Uint8Array[];
            };
        }

        /**
         * Properties of a Histogram.
         * @deprecated Use outray.otlp.Histogram.$Properties instead.
         */
        interface IHistogram extends outray.otlp.Histogram.$Properties {
        }

        /** Represents a Histogram. */
        class Histogram {

            /**
             * Constructs a new Histogram.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.Histogram.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** Histogram dataPoints. */
            dataPoints: outray.otlp.HistogramDataPoint.$Properties[];

            /** Histogram aggregationTemporality. */
            aggregationTemporality: outray.otlp.AggregationTemporality;

            /**
             * Creates a new Histogram instance using the specified properties.
             * @param [properties] Properties to set
             * @returns Histogram instance
             */
            static create(properties: outray.otlp.Histogram.$Shape): outray.otlp.Histogram & outray.otlp.Histogram.$Shape;
            static create(properties?: outray.otlp.Histogram.$Properties): outray.otlp.Histogram;

            /**
             * Encodes the specified Histogram message. Does not implicitly {@link outray.otlp.Histogram.verify|verify} messages.
             * @param message Histogram message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.Histogram.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a Histogram message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.Histogram & outray.otlp.Histogram.$Shape} Histogram
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.Histogram & outray.otlp.Histogram.$Shape;

            /**
             * Creates a Histogram message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns Histogram
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.Histogram;

            /**
             * Creates a plain object from a Histogram message. Also converts values to other types if specified.
             * @param message Histogram
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.Histogram, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this Histogram to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace Histogram {

            /** Properties of a Histogram. */
            interface $Properties {

                /** Histogram dataPoints */
                dataPoints?: (outray.otlp.HistogramDataPoint.$Properties[]|null);

                /** Histogram aggregationTemporality */
                aggregationTemporality?: (outray.otlp.AggregationTemporality|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of a Histogram. */
            type $Shape = {
              dataPoints?: outray.otlp.HistogramDataPoint.$Shape[]|null;
              aggregationTemporality?: outray.otlp.AggregationTemporality|null;
              $unknowns?: Uint8Array[];
            };
        }

        /**
         * Properties of an ExponentialHistogram.
         * @deprecated Use outray.otlp.ExponentialHistogram.$Properties instead.
         */
        interface IExponentialHistogram extends outray.otlp.ExponentialHistogram.$Properties {
        }

        /** Represents an ExponentialHistogram. */
        class ExponentialHistogram {

            /**
             * Constructs a new ExponentialHistogram.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.ExponentialHistogram.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** ExponentialHistogram dataPoints. */
            dataPoints: outray.otlp.ExponentialHistogramDataPoint.$Properties[];

            /** ExponentialHistogram aggregationTemporality. */
            aggregationTemporality: outray.otlp.AggregationTemporality;

            /**
             * Creates a new ExponentialHistogram instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ExponentialHistogram instance
             */
            static create(properties: outray.otlp.ExponentialHistogram.$Shape): outray.otlp.ExponentialHistogram & outray.otlp.ExponentialHistogram.$Shape;
            static create(properties?: outray.otlp.ExponentialHistogram.$Properties): outray.otlp.ExponentialHistogram;

            /**
             * Encodes the specified ExponentialHistogram message. Does not implicitly {@link outray.otlp.ExponentialHistogram.verify|verify} messages.
             * @param message ExponentialHistogram message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.ExponentialHistogram.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an ExponentialHistogram message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.ExponentialHistogram & outray.otlp.ExponentialHistogram.$Shape} ExponentialHistogram
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.ExponentialHistogram & outray.otlp.ExponentialHistogram.$Shape;

            /**
             * Creates an ExponentialHistogram message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ExponentialHistogram
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.ExponentialHistogram;

            /**
             * Creates a plain object from an ExponentialHistogram message. Also converts values to other types if specified.
             * @param message ExponentialHistogram
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.ExponentialHistogram, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ExponentialHistogram to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace ExponentialHistogram {

            /** Properties of an ExponentialHistogram. */
            interface $Properties {

                /** ExponentialHistogram dataPoints */
                dataPoints?: (outray.otlp.ExponentialHistogramDataPoint.$Properties[]|null);

                /** ExponentialHistogram aggregationTemporality */
                aggregationTemporality?: (outray.otlp.AggregationTemporality|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of an ExponentialHistogram. */
            type $Shape = {
              dataPoints?: outray.otlp.ExponentialHistogramDataPoint.$Shape[]|null;
              aggregationTemporality?: outray.otlp.AggregationTemporality|null;
              $unknowns?: Uint8Array[];
            };
        }

        /**
         * Properties of a Summary.
         * @deprecated Use outray.otlp.Summary.$Properties instead.
         */
        interface ISummary extends outray.otlp.Summary.$Properties {
        }

        /** Represents a Summary. */
        class Summary {

            /**
             * Constructs a new Summary.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.Summary.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** Summary dataPoints. */
            dataPoints: outray.otlp.SummaryDataPoint.$Properties[];

            /**
             * Creates a new Summary instance using the specified properties.
             * @param [properties] Properties to set
             * @returns Summary instance
             */
            static create(properties: outray.otlp.Summary.$Shape): outray.otlp.Summary & outray.otlp.Summary.$Shape;
            static create(properties?: outray.otlp.Summary.$Properties): outray.otlp.Summary;

            /**
             * Encodes the specified Summary message. Does not implicitly {@link outray.otlp.Summary.verify|verify} messages.
             * @param message Summary message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.Summary.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a Summary message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.Summary & outray.otlp.Summary.$Shape} Summary
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.Summary & outray.otlp.Summary.$Shape;

            /**
             * Creates a Summary message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns Summary
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.Summary;

            /**
             * Creates a plain object from a Summary message. Also converts values to other types if specified.
             * @param message Summary
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.Summary, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this Summary to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace Summary {

            /** Properties of a Summary. */
            interface $Properties {

                /** Summary dataPoints */
                dataPoints?: (outray.otlp.SummaryDataPoint.$Properties[]|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of a Summary. */
            type $Shape = {
              dataPoints?: outray.otlp.SummaryDataPoint.$Shape[]|null;
              $unknowns?: Uint8Array[];
            };
        }

        /** AggregationTemporality enum. */
        enum AggregationTemporality {

            /** AGGREGATION_TEMPORALITY_UNSPECIFIED value */
            AGGREGATION_TEMPORALITY_UNSPECIFIED = 0,

            /** AGGREGATION_TEMPORALITY_DELTA value */
            AGGREGATION_TEMPORALITY_DELTA = 1,

            /** AGGREGATION_TEMPORALITY_CUMULATIVE value */
            AGGREGATION_TEMPORALITY_CUMULATIVE = 2
        }

        /**
         * Properties of a NumberDataPoint.
         * @deprecated Use outray.otlp.NumberDataPoint.$Properties instead.
         */
        interface INumberDataPoint extends outray.otlp.NumberDataPoint.$Properties {
        }

        /** Represents a NumberDataPoint. */
        class NumberDataPoint {

            /**
             * Constructs a new NumberDataPoint.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.NumberDataPoint.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** NumberDataPoint attributes. */
            attributes: outray.otlp.KeyValue.$Properties[];

            /** NumberDataPoint startTimeUnixNano. */
            startTimeUnixNano: (number|Long);

            /** NumberDataPoint timeUnixNano. */
            timeUnixNano: (number|Long);

            /** NumberDataPoint asDouble. */
            asDouble?: (number|null);

            /** NumberDataPoint asInt. */
            asInt?: (number|Long|null);

            /** NumberDataPoint exemplars. */
            exemplars: outray.otlp.Exemplar.$Properties[];

            /** NumberDataPoint flags. */
            flags: number;

            /** NumberDataPoint value. */
            value?: ("asDouble"|"asInt");

            /**
             * Creates a new NumberDataPoint instance using the specified properties.
             * @param [properties] Properties to set
             * @returns NumberDataPoint instance
             */
            static create(properties: outray.otlp.NumberDataPoint.$Shape): outray.otlp.NumberDataPoint & outray.otlp.NumberDataPoint.$Shape;
            static create(properties?: outray.otlp.NumberDataPoint.$Properties): outray.otlp.NumberDataPoint;

            /**
             * Encodes the specified NumberDataPoint message. Does not implicitly {@link outray.otlp.NumberDataPoint.verify|verify} messages.
             * @param message NumberDataPoint message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.NumberDataPoint.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a NumberDataPoint message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.NumberDataPoint & outray.otlp.NumberDataPoint.$Shape} NumberDataPoint
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.NumberDataPoint & outray.otlp.NumberDataPoint.$Shape;

            /**
             * Creates a NumberDataPoint message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns NumberDataPoint
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.NumberDataPoint;

            /**
             * Creates a plain object from a NumberDataPoint message. Also converts values to other types if specified.
             * @param message NumberDataPoint
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.NumberDataPoint, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this NumberDataPoint to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace NumberDataPoint {

            /** Properties of a NumberDataPoint. */
            interface $Properties {

                /** NumberDataPoint attributes */
                attributes?: (outray.otlp.KeyValue.$Properties[]|null);

                /** NumberDataPoint startTimeUnixNano */
                startTimeUnixNano?: (number|Long|null);

                /** NumberDataPoint timeUnixNano */
                timeUnixNano?: (number|Long|null);

                /** NumberDataPoint asDouble */
                asDouble?: (number|null);

                /** NumberDataPoint asInt */
                asInt?: (number|Long|null);

                /** NumberDataPoint exemplars */
                exemplars?: (outray.otlp.Exemplar.$Properties[]|null);

                /** NumberDataPoint flags */
                flags?: (number|null);

                /** NumberDataPoint value */
                value?: ("asDouble"|"asInt");

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Narrowed shape of a NumberDataPoint. */
            type $Shape = {
              attributes?: outray.otlp.KeyValue.$Shape[]|null;
              startTimeUnixNano?: number|Long|null;
              timeUnixNano?: number|Long|null;
              asDouble?: number|null;
              asInt?: number|Long|null;
              exemplars?: outray.otlp.Exemplar.$Shape[]|null;
              flags?: number|null;
              $unknowns?: Uint8Array[];
            } & (
              ({ value?: undefined; asDouble?: null; asInt?: null }|{ value?: "asDouble"; asDouble: number; asInt?: null }|{ value?: "asInt"; asDouble?: null; asInt: number|Long })
            );
        }

        /**
         * Properties of a HistogramDataPoint.
         * @deprecated Use outray.otlp.HistogramDataPoint.$Properties instead.
         */
        interface IHistogramDataPoint extends outray.otlp.HistogramDataPoint.$Properties {
        }

        /** Represents a HistogramDataPoint. */
        class HistogramDataPoint {

            /**
             * Constructs a new HistogramDataPoint.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.HistogramDataPoint.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** HistogramDataPoint attributes. */
            attributes: outray.otlp.KeyValue.$Properties[];

            /** HistogramDataPoint startTimeUnixNano. */
            startTimeUnixNano: (number|Long);

            /** HistogramDataPoint timeUnixNano. */
            timeUnixNano: (number|Long);

            /** HistogramDataPoint count. */
            count: (number|Long);

            /** HistogramDataPoint sum. */
            sum?: (number|null);

            /** HistogramDataPoint bucketCounts. */
            bucketCounts: (number|Long)[];

            /** HistogramDataPoint explicitBounds. */
            explicitBounds: number[];

            /** HistogramDataPoint exemplars. */
            exemplars: outray.otlp.Exemplar.$Properties[];

            /** HistogramDataPoint flags. */
            flags: number;

            /** HistogramDataPoint min. */
            min?: (number|null);

            /** HistogramDataPoint max. */
            max?: (number|null);

            /**
             * Creates a new HistogramDataPoint instance using the specified properties.
             * @param [properties] Properties to set
             * @returns HistogramDataPoint instance
             */
            static create(properties: outray.otlp.HistogramDataPoint.$Shape): outray.otlp.HistogramDataPoint & outray.otlp.HistogramDataPoint.$Shape;
            static create(properties?: outray.otlp.HistogramDataPoint.$Properties): outray.otlp.HistogramDataPoint;

            /**
             * Encodes the specified HistogramDataPoint message. Does not implicitly {@link outray.otlp.HistogramDataPoint.verify|verify} messages.
             * @param message HistogramDataPoint message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.HistogramDataPoint.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a HistogramDataPoint message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.HistogramDataPoint & outray.otlp.HistogramDataPoint.$Shape} HistogramDataPoint
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.HistogramDataPoint & outray.otlp.HistogramDataPoint.$Shape;

            /**
             * Creates a HistogramDataPoint message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns HistogramDataPoint
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.HistogramDataPoint;

            /**
             * Creates a plain object from a HistogramDataPoint message. Also converts values to other types if specified.
             * @param message HistogramDataPoint
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.HistogramDataPoint, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this HistogramDataPoint to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace HistogramDataPoint {

            /** Properties of a HistogramDataPoint. */
            interface $Properties {

                /** HistogramDataPoint attributes */
                attributes?: (outray.otlp.KeyValue.$Properties[]|null);

                /** HistogramDataPoint startTimeUnixNano */
                startTimeUnixNano?: (number|Long|null);

                /** HistogramDataPoint timeUnixNano */
                timeUnixNano?: (number|Long|null);

                /** HistogramDataPoint count */
                count?: (number|Long|null);

                /** HistogramDataPoint sum */
                sum?: (number|null);

                /** HistogramDataPoint bucketCounts */
                bucketCounts?: ((number|Long)[]|null);

                /** HistogramDataPoint explicitBounds */
                explicitBounds?: (number[]|null);

                /** HistogramDataPoint exemplars */
                exemplars?: (outray.otlp.Exemplar.$Properties[]|null);

                /** HistogramDataPoint flags */
                flags?: (number|null);

                /** HistogramDataPoint min */
                min?: (number|null);

                /** HistogramDataPoint max */
                max?: (number|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of a HistogramDataPoint. */
            type $Shape = {
              attributes?: outray.otlp.KeyValue.$Shape[]|null;
              startTimeUnixNano?: number|Long|null;
              timeUnixNano?: number|Long|null;
              count?: number|Long|null;
              sum?: number|null;
              bucketCounts?: (number|Long)[]|null;
              explicitBounds?: number[]|null;
              exemplars?: outray.otlp.Exemplar.$Shape[]|null;
              flags?: number|null;
              min?: number|null;
              max?: number|null;
              $unknowns?: Uint8Array[];
            };
        }

        /**
         * Properties of an ExponentialHistogramDataPoint.
         * @deprecated Use outray.otlp.ExponentialHistogramDataPoint.$Properties instead.
         */
        interface IExponentialHistogramDataPoint extends outray.otlp.ExponentialHistogramDataPoint.$Properties {
        }

        /** Represents an ExponentialHistogramDataPoint. */
        class ExponentialHistogramDataPoint {

            /**
             * Constructs a new ExponentialHistogramDataPoint.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.ExponentialHistogramDataPoint.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** ExponentialHistogramDataPoint attributes. */
            attributes: outray.otlp.KeyValue.$Properties[];

            /** ExponentialHistogramDataPoint startTimeUnixNano. */
            startTimeUnixNano: (number|Long);

            /** ExponentialHistogramDataPoint timeUnixNano. */
            timeUnixNano: (number|Long);

            /** ExponentialHistogramDataPoint count. */
            count: (number|Long);

            /** ExponentialHistogramDataPoint sum. */
            sum?: (number|null);

            /** ExponentialHistogramDataPoint scale. */
            scale: number;

            /** ExponentialHistogramDataPoint zeroCount. */
            zeroCount: (number|Long);

            /** ExponentialHistogramDataPoint positive. */
            positive?: (outray.otlp.ExponentialHistogramDataPoint.Buckets.$Properties|null);

            /** ExponentialHistogramDataPoint negative. */
            negative?: (outray.otlp.ExponentialHistogramDataPoint.Buckets.$Properties|null);

            /** ExponentialHistogramDataPoint flags. */
            flags: number;

            /** ExponentialHistogramDataPoint exemplars. */
            exemplars: outray.otlp.Exemplar.$Properties[];

            /** ExponentialHistogramDataPoint min. */
            min?: (number|null);

            /** ExponentialHistogramDataPoint max. */
            max?: (number|null);

            /** ExponentialHistogramDataPoint zeroThreshold. */
            zeroThreshold: number;

            /**
             * Creates a new ExponentialHistogramDataPoint instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ExponentialHistogramDataPoint instance
             */
            static create(properties: outray.otlp.ExponentialHistogramDataPoint.$Shape): outray.otlp.ExponentialHistogramDataPoint & outray.otlp.ExponentialHistogramDataPoint.$Shape;
            static create(properties?: outray.otlp.ExponentialHistogramDataPoint.$Properties): outray.otlp.ExponentialHistogramDataPoint;

            /**
             * Encodes the specified ExponentialHistogramDataPoint message. Does not implicitly {@link outray.otlp.ExponentialHistogramDataPoint.verify|verify} messages.
             * @param message ExponentialHistogramDataPoint message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.ExponentialHistogramDataPoint.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an ExponentialHistogramDataPoint message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.ExponentialHistogramDataPoint & outray.otlp.ExponentialHistogramDataPoint.$Shape} ExponentialHistogramDataPoint
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.ExponentialHistogramDataPoint & outray.otlp.ExponentialHistogramDataPoint.$Shape;

            /**
             * Creates an ExponentialHistogramDataPoint message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ExponentialHistogramDataPoint
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.ExponentialHistogramDataPoint;

            /**
             * Creates a plain object from an ExponentialHistogramDataPoint message. Also converts values to other types if specified.
             * @param message ExponentialHistogramDataPoint
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.ExponentialHistogramDataPoint, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ExponentialHistogramDataPoint to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace ExponentialHistogramDataPoint {

            /** Properties of an ExponentialHistogramDataPoint. */
            interface $Properties {

                /** ExponentialHistogramDataPoint attributes */
                attributes?: (outray.otlp.KeyValue.$Properties[]|null);

                /** ExponentialHistogramDataPoint startTimeUnixNano */
                startTimeUnixNano?: (number|Long|null);

                /** ExponentialHistogramDataPoint timeUnixNano */
                timeUnixNano?: (number|Long|null);

                /** ExponentialHistogramDataPoint count */
                count?: (number|Long|null);

                /** ExponentialHistogramDataPoint sum */
                sum?: (number|null);

                /** ExponentialHistogramDataPoint scale */
                scale?: (number|null);

                /** ExponentialHistogramDataPoint zeroCount */
                zeroCount?: (number|Long|null);

                /** ExponentialHistogramDataPoint positive */
                positive?: (outray.otlp.ExponentialHistogramDataPoint.Buckets.$Properties|null);

                /** ExponentialHistogramDataPoint negative */
                negative?: (outray.otlp.ExponentialHistogramDataPoint.Buckets.$Properties|null);

                /** ExponentialHistogramDataPoint flags */
                flags?: (number|null);

                /** ExponentialHistogramDataPoint exemplars */
                exemplars?: (outray.otlp.Exemplar.$Properties[]|null);

                /** ExponentialHistogramDataPoint min */
                min?: (number|null);

                /** ExponentialHistogramDataPoint max */
                max?: (number|null);

                /** ExponentialHistogramDataPoint zeroThreshold */
                zeroThreshold?: (number|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of an ExponentialHistogramDataPoint. */
            type $Shape = {
              attributes?: outray.otlp.KeyValue.$Shape[]|null;
              startTimeUnixNano?: number|Long|null;
              timeUnixNano?: number|Long|null;
              count?: number|Long|null;
              sum?: number|null;
              scale?: number|null;
              zeroCount?: number|Long|null;
              positive?: outray.otlp.ExponentialHistogramDataPoint.Buckets.$Shape|null;
              negative?: outray.otlp.ExponentialHistogramDataPoint.Buckets.$Shape|null;
              flags?: number|null;
              exemplars?: outray.otlp.Exemplar.$Shape[]|null;
              min?: number|null;
              max?: number|null;
              zeroThreshold?: number|null;
              $unknowns?: Uint8Array[];
            };

            /**
             * Properties of a Buckets.
             * @deprecated Use outray.otlp.ExponentialHistogramDataPoint.Buckets.$Properties instead.
             */
            interface IBuckets extends outray.otlp.ExponentialHistogramDataPoint.Buckets.$Properties {
            }

            /** Represents a Buckets. */
            class Buckets {

                /**
                 * Constructs a new Buckets.
                 * @param [properties] Properties to set
                 */
                constructor(properties?: outray.otlp.ExponentialHistogramDataPoint.Buckets.$Properties);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];

                /** Buckets offset. */
                offset: number;

                /** Buckets bucketCounts. */
                bucketCounts: (number|Long)[];

                /**
                 * Creates a new Buckets instance using the specified properties.
                 * @param [properties] Properties to set
                 * @returns Buckets instance
                 */
                static create(properties: outray.otlp.ExponentialHistogramDataPoint.Buckets.$Shape): outray.otlp.ExponentialHistogramDataPoint.Buckets & outray.otlp.ExponentialHistogramDataPoint.Buckets.$Shape;
                static create(properties?: outray.otlp.ExponentialHistogramDataPoint.Buckets.$Properties): outray.otlp.ExponentialHistogramDataPoint.Buckets;

                /**
                 * Encodes the specified Buckets message. Does not implicitly {@link outray.otlp.ExponentialHistogramDataPoint.Buckets.verify|verify} messages.
                 * @param message Buckets message or plain object to encode
                 * @param [writer] Writer to encode to
                 * @returns Writer
                 */
                static encode(message: outray.otlp.ExponentialHistogramDataPoint.Buckets.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

                /**
                 * Decodes a Buckets message from the specified reader or buffer.
                 * @param reader Reader or buffer to decode from
                 * @param [length] Message length if known beforehand
                 * @returns {outray.otlp.ExponentialHistogramDataPoint.Buckets & outray.otlp.ExponentialHistogramDataPoint.Buckets.$Shape} Buckets
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.ExponentialHistogramDataPoint.Buckets & outray.otlp.ExponentialHistogramDataPoint.Buckets.$Shape;

                /**
                 * Creates a Buckets message from a plain object. Also converts values to their respective internal types.
                 * @param object Plain object
                 * @returns Buckets
                 */
                static fromObject(object: { [k: string]: any }): outray.otlp.ExponentialHistogramDataPoint.Buckets;

                /**
                 * Creates a plain object from a Buckets message. Also converts values to other types if specified.
                 * @param message Buckets
                 * @param [options] Conversion options
                 * @returns Plain object
                 */
                static toObject(message: outray.otlp.ExponentialHistogramDataPoint.Buckets, options?: $protobuf.IConversionOptions): { [k: string]: any };

                /**
                 * Converts this Buckets to JSON.
                 * @returns JSON object
                 */
                toJSON(): { [k: string]: any };
            }

            namespace Buckets {

                /** Properties of a Buckets. */
                interface $Properties {

                    /** Buckets offset */
                    offset?: (number|null);

                    /** Buckets bucketCounts */
                    bucketCounts?: ((number|Long)[]|null);

                    /** Unknown fields preserved while decoding when enabled */
                    $unknowns?: Uint8Array[];
                }

                /** Shape of a Buckets. */
                type $Shape = outray.otlp.ExponentialHistogramDataPoint.Buckets.$Properties;
            }
        }

        /**
         * Properties of a SummaryDataPoint.
         * @deprecated Use outray.otlp.SummaryDataPoint.$Properties instead.
         */
        interface ISummaryDataPoint extends outray.otlp.SummaryDataPoint.$Properties {
        }

        /** Represents a SummaryDataPoint. */
        class SummaryDataPoint {

            /**
             * Constructs a new SummaryDataPoint.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.SummaryDataPoint.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** SummaryDataPoint attributes. */
            attributes: outray.otlp.KeyValue.$Properties[];

            /** SummaryDataPoint startTimeUnixNano. */
            startTimeUnixNano: (number|Long);

            /** SummaryDataPoint timeUnixNano. */
            timeUnixNano: (number|Long);

            /** SummaryDataPoint count. */
            count: (number|Long);

            /** SummaryDataPoint sum. */
            sum: number;

            /** SummaryDataPoint quantileValues. */
            quantileValues: outray.otlp.SummaryDataPoint.ValueAtQuantile.$Properties[];

            /** SummaryDataPoint flags. */
            flags: number;

            /**
             * Creates a new SummaryDataPoint instance using the specified properties.
             * @param [properties] Properties to set
             * @returns SummaryDataPoint instance
             */
            static create(properties: outray.otlp.SummaryDataPoint.$Shape): outray.otlp.SummaryDataPoint & outray.otlp.SummaryDataPoint.$Shape;
            static create(properties?: outray.otlp.SummaryDataPoint.$Properties): outray.otlp.SummaryDataPoint;

            /**
             * Encodes the specified SummaryDataPoint message. Does not implicitly {@link outray.otlp.SummaryDataPoint.verify|verify} messages.
             * @param message SummaryDataPoint message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.SummaryDataPoint.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a SummaryDataPoint message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.SummaryDataPoint & outray.otlp.SummaryDataPoint.$Shape} SummaryDataPoint
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.SummaryDataPoint & outray.otlp.SummaryDataPoint.$Shape;

            /**
             * Creates a SummaryDataPoint message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns SummaryDataPoint
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.SummaryDataPoint;

            /**
             * Creates a plain object from a SummaryDataPoint message. Also converts values to other types if specified.
             * @param message SummaryDataPoint
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.SummaryDataPoint, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this SummaryDataPoint to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace SummaryDataPoint {

            /** Properties of a SummaryDataPoint. */
            interface $Properties {

                /** SummaryDataPoint attributes */
                attributes?: (outray.otlp.KeyValue.$Properties[]|null);

                /** SummaryDataPoint startTimeUnixNano */
                startTimeUnixNano?: (number|Long|null);

                /** SummaryDataPoint timeUnixNano */
                timeUnixNano?: (number|Long|null);

                /** SummaryDataPoint count */
                count?: (number|Long|null);

                /** SummaryDataPoint sum */
                sum?: (number|null);

                /** SummaryDataPoint quantileValues */
                quantileValues?: (outray.otlp.SummaryDataPoint.ValueAtQuantile.$Properties[]|null);

                /** SummaryDataPoint flags */
                flags?: (number|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of a SummaryDataPoint. */
            type $Shape = {
              attributes?: outray.otlp.KeyValue.$Shape[]|null;
              startTimeUnixNano?: number|Long|null;
              timeUnixNano?: number|Long|null;
              count?: number|Long|null;
              sum?: number|null;
              quantileValues?: outray.otlp.SummaryDataPoint.ValueAtQuantile.$Shape[]|null;
              flags?: number|null;
              $unknowns?: Uint8Array[];
            };

            /**
             * Properties of a ValueAtQuantile.
             * @deprecated Use outray.otlp.SummaryDataPoint.ValueAtQuantile.$Properties instead.
             */
            interface IValueAtQuantile extends outray.otlp.SummaryDataPoint.ValueAtQuantile.$Properties {
            }

            /** Represents a ValueAtQuantile. */
            class ValueAtQuantile {

                /**
                 * Constructs a new ValueAtQuantile.
                 * @param [properties] Properties to set
                 */
                constructor(properties?: outray.otlp.SummaryDataPoint.ValueAtQuantile.$Properties);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];

                /** ValueAtQuantile quantile. */
                quantile: number;

                /** ValueAtQuantile value. */
                value: number;

                /**
                 * Creates a new ValueAtQuantile instance using the specified properties.
                 * @param [properties] Properties to set
                 * @returns ValueAtQuantile instance
                 */
                static create(properties: outray.otlp.SummaryDataPoint.ValueAtQuantile.$Shape): outray.otlp.SummaryDataPoint.ValueAtQuantile & outray.otlp.SummaryDataPoint.ValueAtQuantile.$Shape;
                static create(properties?: outray.otlp.SummaryDataPoint.ValueAtQuantile.$Properties): outray.otlp.SummaryDataPoint.ValueAtQuantile;

                /**
                 * Encodes the specified ValueAtQuantile message. Does not implicitly {@link outray.otlp.SummaryDataPoint.ValueAtQuantile.verify|verify} messages.
                 * @param message ValueAtQuantile message or plain object to encode
                 * @param [writer] Writer to encode to
                 * @returns Writer
                 */
                static encode(message: outray.otlp.SummaryDataPoint.ValueAtQuantile.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

                /**
                 * Decodes a ValueAtQuantile message from the specified reader or buffer.
                 * @param reader Reader or buffer to decode from
                 * @param [length] Message length if known beforehand
                 * @returns {outray.otlp.SummaryDataPoint.ValueAtQuantile & outray.otlp.SummaryDataPoint.ValueAtQuantile.$Shape} ValueAtQuantile
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.SummaryDataPoint.ValueAtQuantile & outray.otlp.SummaryDataPoint.ValueAtQuantile.$Shape;

                /**
                 * Creates a ValueAtQuantile message from a plain object. Also converts values to their respective internal types.
                 * @param object Plain object
                 * @returns ValueAtQuantile
                 */
                static fromObject(object: { [k: string]: any }): outray.otlp.SummaryDataPoint.ValueAtQuantile;

                /**
                 * Creates a plain object from a ValueAtQuantile message. Also converts values to other types if specified.
                 * @param message ValueAtQuantile
                 * @param [options] Conversion options
                 * @returns Plain object
                 */
                static toObject(message: outray.otlp.SummaryDataPoint.ValueAtQuantile, options?: $protobuf.IConversionOptions): { [k: string]: any };

                /**
                 * Converts this ValueAtQuantile to JSON.
                 * @returns JSON object
                 */
                toJSON(): { [k: string]: any };
            }

            namespace ValueAtQuantile {

                /** Properties of a ValueAtQuantile. */
                interface $Properties {

                    /** ValueAtQuantile quantile */
                    quantile?: (number|null);

                    /** ValueAtQuantile value */
                    value?: (number|null);

                    /** Unknown fields preserved while decoding when enabled */
                    $unknowns?: Uint8Array[];
                }

                /** Shape of a ValueAtQuantile. */
                type $Shape = outray.otlp.SummaryDataPoint.ValueAtQuantile.$Properties;
            }
        }

        /**
         * Properties of an Exemplar.
         * @deprecated Use outray.otlp.Exemplar.$Properties instead.
         */
        interface IExemplar extends outray.otlp.Exemplar.$Properties {
        }

        /** Represents an Exemplar. */
        class Exemplar {

            /**
             * Constructs a new Exemplar.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.Exemplar.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** Exemplar filteredAttributes. */
            filteredAttributes: outray.otlp.KeyValue.$Properties[];

            /** Exemplar timeUnixNano. */
            timeUnixNano: (number|Long);

            /** Exemplar asDouble. */
            asDouble?: (number|null);

            /** Exemplar asInt. */
            asInt?: (number|Long|null);

            /** Exemplar spanId. */
            spanId: Uint8Array;

            /** Exemplar traceId. */
            traceId: Uint8Array;

            /** Exemplar value. */
            value?: ("asDouble"|"asInt");

            /**
             * Creates a new Exemplar instance using the specified properties.
             * @param [properties] Properties to set
             * @returns Exemplar instance
             */
            static create(properties: outray.otlp.Exemplar.$Shape): outray.otlp.Exemplar & outray.otlp.Exemplar.$Shape;
            static create(properties?: outray.otlp.Exemplar.$Properties): outray.otlp.Exemplar;

            /**
             * Encodes the specified Exemplar message. Does not implicitly {@link outray.otlp.Exemplar.verify|verify} messages.
             * @param message Exemplar message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.Exemplar.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an Exemplar message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.Exemplar & outray.otlp.Exemplar.$Shape} Exemplar
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.Exemplar & outray.otlp.Exemplar.$Shape;

            /**
             * Creates an Exemplar message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns Exemplar
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.Exemplar;

            /**
             * Creates a plain object from an Exemplar message. Also converts values to other types if specified.
             * @param message Exemplar
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.Exemplar, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this Exemplar to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace Exemplar {

            /** Properties of an Exemplar. */
            interface $Properties {

                /** Exemplar filteredAttributes */
                filteredAttributes?: (outray.otlp.KeyValue.$Properties[]|null);

                /** Exemplar timeUnixNano */
                timeUnixNano?: (number|Long|null);

                /** Exemplar asDouble */
                asDouble?: (number|null);

                /** Exemplar asInt */
                asInt?: (number|Long|null);

                /** Exemplar spanId */
                spanId?: (Uint8Array|null);

                /** Exemplar traceId */
                traceId?: (Uint8Array|null);

                /** Exemplar value */
                value?: ("asDouble"|"asInt");

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Narrowed shape of an Exemplar. */
            type $Shape = {
              filteredAttributes?: outray.otlp.KeyValue.$Shape[]|null;
              timeUnixNano?: number|Long|null;
              asDouble?: number|null;
              asInt?: number|Long|null;
              spanId?: Uint8Array|null;
              traceId?: Uint8Array|null;
              $unknowns?: Uint8Array[];
            } & (
              ({ value?: undefined; asDouble?: null; asInt?: null }|{ value?: "asDouble"; asDouble: number; asInt?: null }|{ value?: "asInt"; asDouble?: null; asInt: number|Long })
            );
        }

        /**
         * Properties of an ExportMetricsServiceRequest.
         * @deprecated Use outray.otlp.ExportMetricsServiceRequest.$Properties instead.
         */
        interface IExportMetricsServiceRequest extends outray.otlp.ExportMetricsServiceRequest.$Properties {
        }

        /** Represents an ExportMetricsServiceRequest. */
        class ExportMetricsServiceRequest {

            /**
             * Constructs a new ExportMetricsServiceRequest.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.ExportMetricsServiceRequest.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** ExportMetricsServiceRequest resourceMetrics. */
            resourceMetrics: outray.otlp.ResourceMetrics.$Properties[];

            /**
             * Creates a new ExportMetricsServiceRequest instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ExportMetricsServiceRequest instance
             */
            static create(properties: outray.otlp.ExportMetricsServiceRequest.$Shape): outray.otlp.ExportMetricsServiceRequest & outray.otlp.ExportMetricsServiceRequest.$Shape;
            static create(properties?: outray.otlp.ExportMetricsServiceRequest.$Properties): outray.otlp.ExportMetricsServiceRequest;

            /**
             * Encodes the specified ExportMetricsServiceRequest message. Does not implicitly {@link outray.otlp.ExportMetricsServiceRequest.verify|verify} messages.
             * @param message ExportMetricsServiceRequest message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.ExportMetricsServiceRequest.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an ExportMetricsServiceRequest message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.ExportMetricsServiceRequest & outray.otlp.ExportMetricsServiceRequest.$Shape} ExportMetricsServiceRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.ExportMetricsServiceRequest & outray.otlp.ExportMetricsServiceRequest.$Shape;

            /**
             * Creates an ExportMetricsServiceRequest message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ExportMetricsServiceRequest
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.ExportMetricsServiceRequest;

            /**
             * Creates a plain object from an ExportMetricsServiceRequest message. Also converts values to other types if specified.
             * @param message ExportMetricsServiceRequest
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.ExportMetricsServiceRequest, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ExportMetricsServiceRequest to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace ExportMetricsServiceRequest {

            /** Properties of an ExportMetricsServiceRequest. */
            interface $Properties {

                /** ExportMetricsServiceRequest resourceMetrics */
                resourceMetrics?: (outray.otlp.ResourceMetrics.$Properties[]|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of an ExportMetricsServiceRequest. */
            type $Shape = {
              resourceMetrics?: outray.otlp.ResourceMetrics.$Shape[]|null;
              $unknowns?: Uint8Array[];
            };
        }

        /**
         * Properties of an ExportMetricsServiceResponse.
         * @deprecated Use outray.otlp.ExportMetricsServiceResponse.$Properties instead.
         */
        interface IExportMetricsServiceResponse extends outray.otlp.ExportMetricsServiceResponse.$Properties {
        }

        /** Represents an ExportMetricsServiceResponse. */
        class ExportMetricsServiceResponse {

            /**
             * Constructs a new ExportMetricsServiceResponse.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.ExportMetricsServiceResponse.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** ExportMetricsServiceResponse partialSuccess. */
            partialSuccess?: (outray.otlp.ExportMetricsPartialSuccess.$Properties|null);

            /**
             * Creates a new ExportMetricsServiceResponse instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ExportMetricsServiceResponse instance
             */
            static create(properties: outray.otlp.ExportMetricsServiceResponse.$Shape): outray.otlp.ExportMetricsServiceResponse & outray.otlp.ExportMetricsServiceResponse.$Shape;
            static create(properties?: outray.otlp.ExportMetricsServiceResponse.$Properties): outray.otlp.ExportMetricsServiceResponse;

            /**
             * Encodes the specified ExportMetricsServiceResponse message. Does not implicitly {@link outray.otlp.ExportMetricsServiceResponse.verify|verify} messages.
             * @param message ExportMetricsServiceResponse message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.ExportMetricsServiceResponse.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an ExportMetricsServiceResponse message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.ExportMetricsServiceResponse & outray.otlp.ExportMetricsServiceResponse.$Shape} ExportMetricsServiceResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.ExportMetricsServiceResponse & outray.otlp.ExportMetricsServiceResponse.$Shape;

            /**
             * Creates an ExportMetricsServiceResponse message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ExportMetricsServiceResponse
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.ExportMetricsServiceResponse;

            /**
             * Creates a plain object from an ExportMetricsServiceResponse message. Also converts values to other types if specified.
             * @param message ExportMetricsServiceResponse
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.ExportMetricsServiceResponse, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ExportMetricsServiceResponse to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace ExportMetricsServiceResponse {

            /** Properties of an ExportMetricsServiceResponse. */
            interface $Properties {

                /** ExportMetricsServiceResponse partialSuccess */
                partialSuccess?: (outray.otlp.ExportMetricsPartialSuccess.$Properties|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of an ExportMetricsServiceResponse. */
            type $Shape = outray.otlp.ExportMetricsServiceResponse.$Properties;
        }

        /**
         * Properties of an ExportMetricsPartialSuccess.
         * @deprecated Use outray.otlp.ExportMetricsPartialSuccess.$Properties instead.
         */
        interface IExportMetricsPartialSuccess extends outray.otlp.ExportMetricsPartialSuccess.$Properties {
        }

        /** Represents an ExportMetricsPartialSuccess. */
        class ExportMetricsPartialSuccess {

            /**
             * Constructs a new ExportMetricsPartialSuccess.
             * @param [properties] Properties to set
             */
            constructor(properties?: outray.otlp.ExportMetricsPartialSuccess.$Properties);

            /** Unknown fields preserved while decoding when enabled */
            $unknowns?: Uint8Array[];

            /** ExportMetricsPartialSuccess rejectedDataPoints. */
            rejectedDataPoints: (number|Long);

            /** ExportMetricsPartialSuccess errorMessage. */
            errorMessage: string;

            /**
             * Creates a new ExportMetricsPartialSuccess instance using the specified properties.
             * @param [properties] Properties to set
             * @returns ExportMetricsPartialSuccess instance
             */
            static create(properties: outray.otlp.ExportMetricsPartialSuccess.$Shape): outray.otlp.ExportMetricsPartialSuccess & outray.otlp.ExportMetricsPartialSuccess.$Shape;
            static create(properties?: outray.otlp.ExportMetricsPartialSuccess.$Properties): outray.otlp.ExportMetricsPartialSuccess;

            /**
             * Encodes the specified ExportMetricsPartialSuccess message. Does not implicitly {@link outray.otlp.ExportMetricsPartialSuccess.verify|verify} messages.
             * @param message ExportMetricsPartialSuccess message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            static encode(message: outray.otlp.ExportMetricsPartialSuccess.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an ExportMetricsPartialSuccess message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns {outray.otlp.ExportMetricsPartialSuccess & outray.otlp.ExportMetricsPartialSuccess.$Shape} ExportMetricsPartialSuccess
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): outray.otlp.ExportMetricsPartialSuccess & outray.otlp.ExportMetricsPartialSuccess.$Shape;

            /**
             * Creates an ExportMetricsPartialSuccess message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns ExportMetricsPartialSuccess
             */
            static fromObject(object: { [k: string]: any }): outray.otlp.ExportMetricsPartialSuccess;

            /**
             * Creates a plain object from an ExportMetricsPartialSuccess message. Also converts values to other types if specified.
             * @param message ExportMetricsPartialSuccess
             * @param [options] Conversion options
             * @returns Plain object
             */
            static toObject(message: outray.otlp.ExportMetricsPartialSuccess, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this ExportMetricsPartialSuccess to JSON.
             * @returns JSON object
             */
            toJSON(): { [k: string]: any };
        }

        namespace ExportMetricsPartialSuccess {

            /** Properties of an ExportMetricsPartialSuccess. */
            interface $Properties {

                /** ExportMetricsPartialSuccess rejectedDataPoints */
                rejectedDataPoints?: (number|Long|null);

                /** ExportMetricsPartialSuccess errorMessage */
                errorMessage?: (string|null);

                /** Unknown fields preserved while decoding when enabled */
                $unknowns?: Uint8Array[];
            }

            /** Shape of an ExportMetricsPartialSuccess. */
            type $Shape = outray.otlp.ExportMetricsPartialSuccess.$Properties;
        }
    }
}
