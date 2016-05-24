'use strict';

/**
 * Mongoose plugin
 */
const _ = require('lodash');
const mongoose = require('mongoose');
const Promise = require('bluebird');

/**
 * Setup counter schema and model
 *
 * @type {mongoose}
 */
const CounterSchema = new mongoose.Schema({
  model: {
    type: String,
    require: true,
  },
  field: {
    type: String,
    require: true,
  },
  count: {
    type: Number,
    default: 0,
  },
});

CounterSchema.index(
  { field: 1, model: 1 },
  { unique: true, required: true, index: -1 }
);

const Counter = mongoose.model('_Counter', CounterSchema);

/**
 * Reset counter sequence start
 *
 * @param {Object} options Mongoose plugin options
 * @param {Function} next Callback handler
 */
function resetSequence(options, next) {
  Counter.findOneAndUpdate(
    { model: options.model, field: options.field },
    { count: options.start - options.increment },
    { new: true, upsert: true },
    (err, doc) => (err ? next(err) : next(null, doc))
  );
}

/**
 * Retrieve the next sequence in the counter and update field
 *
 * @param {Object} options Counter options
 * @param {Object} resource Mongoose model instance
 * @param {Function} next Callback handler
 */
function nextCount(options, resource, next) {
  if (!resource.isNew || !_.isUndefined(resource[options.field])) {
    return next();
  }
  return Counter.findOne({
    model: options.model,
    field: options.field,
  }).then((item) => {
    let promise = Promise.resolve(item);
    if (!item) {
      promise = initCounter(options);
    }
    promise.then((counter) => {
      counter.count += options.increment;

      let value = '';
      if (_.isFunction(options.prefix)) {
        value += options.prefix(resource);
      }
      else {
        value += options.prefix.toString();
      }

      value += counter.count;

      if (_.isFunction(options.suffix)) {
        value += options.suffix(resource);
      }
      else {
        value += options.suffix.toString();
      }

      resource[options.field] = value;

      return counter.save(next);
    });
  }).catch(next);
}

/**
 * Retrieve the next sequence in the counter and update field
 *
 * @param {Object} options Counter options
 * @return {Promise} Promise fulfilled when increment field have been setted
 */
function nextSequence(options) {
  const resource = this;
  return new Promise((resolve, reject) => {
    nextCount(options, resource, (err) =>
      (err ? reject(err) : resolve())
    );
  });
}

/**
 * Create a new counter for the current model
 *
 * @param {Object} options Counter options
 * @return {Object} counter mongoose doc
 */
function initCounter(options) {
  const newCount = new Counter({
    model: options.model,
    field: options.field,
    count: options.start - options.increment,
  });

  return newCount.save();
}

/**
 * Mongoose plugin, adds a counter for a given `model` and `field`, also add
 * the autoincrement field into the schema.
 *
 * @param {Object} schema Mongoose schema
 * @param {Options} options Additional options for autoincremented field
 *   @property {String}           model       mongoose model name
 *   @property {String}           field       mongoose field name
 *   @property {Integer}          [start]     start number for counter, default `1`
 *   @property {Integer}          [increment] number to increment counter, default `1`
 *   @property {String/Function}  [prefix]    counter prefix, default ``
 *   @property {String/Function}  [suffix]    counter suffix, defautl ``
 */
function plugin(schema, options) {
  if (!_.isPlainObject(options)) {
    throw new Error('Mongoose Increment Plugin: require `options` parameter');
  }
  if (!_.isString(options.modelName)) {
    throw new Error('Mongoose Increment Plugin: require `options.modelName` parameter');
  }
  if (!_.isString(options.field)) {
    throw new Error('Mongoose Increment Plugin: require `options.field` parameter');
  }
  if (options.start && !_.isInteger(options.start)) {
    throw new Error('Mongoose Increment Plugin: require `options.start` parameter must be an integer');
  }
  if (options.increment && !_.isInteger(options.increment)) {
    throw new Error('Mongoose Increment Plugin: require `options.increment` parameter must be an integer');
  }
  const opts = {
    model: options.modelName,
    field: options.field,
    start: options.start || 1,
    increment: options.increment || 1,
    prefix: options.prefix || '',
    suffix: options.suffix || '',
  };

  const fieldSchema = {};

  fieldSchema[opts.field] = {
    type: String,
    require: true,
    unique: true,
  };

  schema.add(fieldSchema);

  schema.methods.nextSequence = _.partial(nextSequence, opts);

  schema.statics.resetSequence = _.partial(resetSequence, opts);

  schema.pre('save', function preSave(next) {
    nextCount(opts, this, next);
  });
}

module.exports = plugin;
