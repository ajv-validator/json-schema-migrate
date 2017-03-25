'use strict';

module.exports = {
  draft6: draft6
};

var ajv, metaSchema4, metaSchemaV5, hyperSchema
  , migrateSchema, migrateSchemaV5, migrateHyperSchema;

function draft6(schema, opts) {
  opts = opts || {};
  ajv = ajv || getAjv(opts);
  if (opts.validateSchema !== false)
    ajv.validateSchema(schema, true);

  var v5 = schema.$schema == metaSchemaV5.id || (!schema.$schema && opts.v5);
  if (v5 && !migrateSchemaV5) {
    migrateSchemaV5 = JSON.parse(JSON.stringify(migrateSchema));
    migrateSchemaV5.$id = 'migrateSchemaV5';
    copy({
      contains: { $ref: '#' },
      patternGroups: {
        additionalProperties: {
          properties: {
            schema: { $ref: '#' }
          }
        }
      },
      'switch': {
        items: {
          properties: {
            'if': { $ref: '#' },
            then: { $ref: '#/definitions/booleanOrSchema' }
          }
        }
      }
    }, migrateSchemaV5.properties);
    ajv.addSchema(migrateSchemaV5);
  }

  if (schema.$schema == hyperSchema.id && !migrateHyperSchema) {
    migrateHyperSchema = JSON.parse(JSON.stringify(migrateSchema));
    migrateHyperSchema.$id = 'migrateHyperSchema';
    copy({
      links: {
        items: {
          properties: {
            targetSchema: { $ref: '#' },
            schema: { $ref: '#' }
          }
        }
      }
    }, migrateHyperSchema.properties);
    ajv.addSchema(migrateHyperSchema);
  }
  var migrateID = v5
                  ? 'migrateSchemaV5'
                  : schema.$schema == hyperSchema.id
                    ? 'migrateHyperSchema'
                    : 'migrateSchema';
  var migrate = ajv.getSchema(migrateID);
  migrate(schema);
  return schema;
}


function getAjv(opts) {
  var Ajv = require('ajv');
  ajv = new Ajv({processCode: require('js-beautify').js_beautify});
  metaSchema4 = require('ajv/lib/refs/json-schema-draft-04.json');
  metaSchemaV5 = require('ajv/lib/refs/json-schema-v5.json');
  hyperSchema =  require('./hyper-schema.json');
  ajv.addMetaSchema(metaSchema4);
  ajv._refs['http://json-schema.org/schema'] = metaSchema4.id;
  ajv.addMetaSchema(metaSchemaV5);
  ajv.addMetaSchema(hyperSchema);
  ajv._opts.defaultMeta = opts.v5
                          ? metaSchemaV5.id
                          : metaSchema4.id;

  ajv.addKeyword('migrateSchemaToDraft6', {
    valid: true,
    schema: false,
    modifying: true,
    metaSchema: { const: true },
    validate: function (dataSchema, dataPath, parentDataSchema, parentDataProperty) {
      if (typeof dataSchema != 'object') return;
      var keys = Object.keys(dataSchema);
      if (parentDataSchema) {
        if (keys.length == 0) {
          parentDataSchema[parentDataProperty] = true;
          return;
        }
        if (keys.length == 1 && keys[0] == 'not' && dataSchema.not === true) {
          parentDataSchema[parentDataProperty] = false;
          return;
        }
      }
      if (dataSchema.id) dataSchema.$id = use('id');
      var $s = dataSchema.$schema;
      if ($s) {
        dataSchema.$schema = $s == metaSchema4.id || $s == metaSchemaV5.id
                              ? 'http://json-schema.org/draft-06/schema#'
                              :  $s == hyperSchema.id
                                ? 'http://json-schema.org/draft-06/hyper-schema#'
                                : $s;
      }

      migrateExclusiveM('aximum');
      migrateExclusiveM('inimum');
      if (dataSchema.constant !== undefined)
        dataSchema.const = use('constant');
      else if (Array.isArray(dataSchema.enum) && dataSchema.enum.length == 1)
        dataSchema.const = use('enum')[0];

      function migrateExclusiveM(limit) {
        var key = 'exclusiveM' + limit;
        if (dataSchema[key] === true)
          dataSchema[key] = use('m' + limit);
        else if (dataSchema[key] === false)
          delete dataSchema[key];
        else if (dataSchema[key] !== undefined)
          console.warn(key + ' is not boolean');
      }

      function use(keyword) {
        var value = dataSchema[keyword];
        delete dataSchema[keyword];
        return value;
      }
    }
  });

  migrateSchema = require('./migrate_schema.json');
  ajv.addSchema(migrateSchema);
  return ajv;
}


function copy(o, to) {
  to = to || {};
  for (var key in o) to[key] = o[key];
  return to;
}
