var DBHelper, async, client, mysql, _;

_ = require("underscore");

async = require("async");

mysql = require("mysql");

client = {};

exports.createClient = function(config) {
  return client = exports.client = mysql.createClient(config);
};

DBHelper = (function() {

  DBHelper.name = 'DBHelper';

  function DBHelper() {
    this.client = client;
  }

  DBHelper.prototype.q = function(qry, onComplete) {
    var _this = this;
    if (onComplete == null) {
      onComplete = function() {};
    }
    return this.client.query(qry, function(err, results, fields) {
      if (err) {
        throw err;
        return false;
      }
      return onComplete(results, fields);
    });
  };

  DBHelper.prototype.use = function(db) {
    return this.client.query("USE " + db);
  };

  DBHelper.prototype.truncate = function(table, onComplete) {
    if (onComplete == null) {
      onComplete = function() {};
    }
    return this.client.query("TRUNCATE TABLE " + table, onComplete);
  };

  DBHelper.prototype.onerow = function(qry, onComplete) {
    return this.q("" + qry + " LIMIT 0,1", function(results, fields) {
      return onComplete(results[0], fields);
    });
  };

  DBHelper.prototype.get = function(args) {
    var fields, qry, qrydata, vals;
    if (args == null) {
      args = {};
    }
    _.defaults(args, {
      table: "",
      id: null,
      fields: null,
      where: null,
      keyById: false,
      onerow: false,
      orderby: null,
      resultsReturn: false,
      onComplete: function() {}
    });
    fields = !(args.fields != null) ? "*" : (_.isArray(args.fields) ? args.fields.join(", ") : args.fields);
    qry = "SELECT " + fields + " FROM " + args.table + " ";
    if ((args.where != null) || (args.id != null)) {
      qry += "WHERE ";
      if (args.id != null) {
        qry += "id = ?";
        vals = [args.id];
        args.onerow = true;
      } else {
        qrydata = _.map(args.where, function(data, key) {
          if (typeof data === "object") {
            switch (_.keys(data)[0]) {
              case "$ne":
                return "" + key + " <> ?";
            }
          } else {
            return "" + key + " = ?";
          }
        });
        qry += qrydata.join(" AND ");
        vals = _.map(args.where, function(data, key) {
          if (typeof data === "object") {
            return _.values(data)[0];
          } else {
            return data;
          }
        });
      }
    } else {
      vals = [];
    }
    if (args.orderby != null) {
      qry += " ORDER BY " + args.orderby;
    }
    return this.client.query(qry, vals, function(err, results, fields) {
      var endResult;
      if (err) {
        throw err;
        return false;
      }
      if (args.onerow) {
        return args.onComplete(results[0]);
      } else if (args.keyById) {
        endResult = {};
        _.each(results, function(result) {
          return endResult[" " + result.id + " "] = result;
        });
        return args.onComplete(endResult);
      } else if (args.resultsReturn) {
        return args.onComplete(results);
      } else {
        return args.onComplete(err, results, fields);
      }
    });
  };

  DBHelper.prototype.insert = function(args) {
    var prefix, qry;
    if (args == null) {
      args = {};
    }
    _.defaults(args, {
      table: "",
      data: {},
      initUser: false,
      replace: false,
      onComplete: function() {}
    });
    if (args.initUser) {
      _.extend(args.data, {
        create_user: args.initUser,
        create_date: this.now(),
        modify_user: args.initUser,
        modify_date: this.now()
      });
    }
    prefix = args.replace ? "REPLACE" : "INSERT";
    qry = "" + prefix + " INTO " + args.table + " ";
    qry += "(" + _.keys(args.data).join(", ") + ")";
    qry += " VALUES (" + _.map(args.data, function() {
      return "?";
    }).join(", ") + ")";
    return this.client.query(qry, this.cleanValues(args.data), function(err, info) {
      var newID;
      newID = err != null ? null : info.insertId;
      return args.onComplete(err, info, newID);
    });
  };

  DBHelper.prototype.update = function(args) {
    var qry, vals;
    if (args == null) {
      args = {};
    }
    _.defaults(args, {
      table: "",
      data: {},
      id: null,
      where: {},
      editUser: false,
      onComplete: function() {}
    });
    if (args.editUser) {
      _.extend(args.data, {
        modify_user: args.editUser,
        modify_date: this.now()
      });
    }
    if (args.id != null) {
      args.where = {
        id: args.id
      };
    }
    qry = "UPDATE " + args.table + " SET ";
    qry += _.map(args.data, function(data, key) {
      return "" + key + " = ?";
    }).join(", ");
    qry += " WHERE ";
    qry += _.map(args.where, function(data, key) {
      return "" + key + " = ?";
    }).join(" AND ");
    vals = this.cleanValues(args.data);
    _.each(_.values(args.where), function(value) {
      return vals.push(value);
    });
    return this.client.query(qry, vals, args.onComplete);
  };

  DBHelper.prototype.deletion = function(args, onComplete) {
    var qry;
    if (args == null) {
      args = {};
    }
    if (onComplete == null) {
      onComplete = function() {};
    }
    _.defaults(args, {
      table: "",
      where: {},
      id: null,
      onComplete: null
    });
    if (args.id != null) {
      args.data = {
        id: args.id
      };
    }
    if (args.onComplete != null) {
      onComplete = args.onComplete;
    }
    qry = "DELETE FROM " + args.table + " WHERE ";
    qry += _.map(args.where, function(data, key) {
      return "" + key + " = ?";
    }).join(" AND ");
    return this.client.query(qry, _.values(args.where), onComplete);
  };

  DBHelper.prototype.loadExportData = function(args) {
    var self;
    if (args == null) {
      args = {};
    }
    _.defaults(args, {
      data: "",
      truncate: true,
      onComplete: function() {}
    });
    self = this;
    return async.forEach(args.data, (function(data, callback) {
      var loadData;
      loadData = function() {
        return async.forEach(data.rows, (function(rowdata, subcallback) {
          _.map(rowdata, function(row, key) {
            if (!(row != null)) {
              return delete rowdata[key];
            }
          });
          return self.insert({
            table: data.table,
            data: rowdata,
            onComplete: function() {
              return subcallback();
            }
          });
        }), function() {
          return callback();
        });
      };
      if (args.truncate) {
        return self.truncate(data.table, function() {
          return loadData();
        });
      } else {
        return loadData();
      }
    }), function() {
      return args.onComplete();
    });
  };

  DBHelper.prototype.now = function() {
    return new Date();
  };

  DBHelper.prototype.escapedNow = function() {
    return this.client.escape(this.now());
  };

  DBHelper.prototype.cleanValues = function(values) {
    return _.map(values, function(value) {
      if (typeof value === "string") {
        return value = value.replace(/\<\s*script.*\>.*\<\s*\/.*script.*\>/gi, '');
      } else {
        return value;
      }
    });
  };

  return DBHelper;

})();

exports.DBHelper = DBHelper;