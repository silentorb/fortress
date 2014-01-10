var MetaHub = require('metahub');var Ground = require('ground');var Vineyard = require('vineyard');var when = require('when');var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var fs = require('fs');

var Fortress = (function (_super) {
    __extends(Fortress, _super);
    function Fortress() {
        _super.apply(this, arguments);
        this.gate_types = {};
        this.gates = [];
    }
    Fortress.prototype.add_gate = function (source) {
        var type = this.gate_types[source.type];
        if (!type)
            throw new Error('Could not find gate: "' + source.type + '".');

        var gate = new type(this, source);
        this.gates.push(gate);
    };

    Fortress.prototype.get_roles = function (user) {
        if (user.roles)
            return when.resolve(user.roles);

        var query = this.ground.create_query('role');
        query.add_property_filter('users', user.id);
        return query.run_core().then(function (roles) {
            return user.roles = roles;
        });
    };

    Fortress.prototype.user_has_role = function (user, role_name) {
        for (var i in user.roles) {
            if (user.roles[i].name == role_name)
                return true;
        }
        return false;
    };

    Fortress.prototype.user_has_any_role = function (user, role_names) {
        for (var a in user.roles) {
            for (var b in role_names) {
                if (user.roles[a].name == role_names[b])
                    return true;
            }
        }
        return false;
    };

    Fortress.prototype.grow = function () {
        this.gate_types['admin'] = Fortress.Admin;
        this.gate_types['user_content'] = Fortress.User_Content;
        this.gate_types['link'] = Fortress.Link;
        var json = fs.readFileSync(this.config.config_path, 'ascii');
        var config = JSON.parse(json);

        for (var i = 0; i < config.gates.length; ++i) {
            this.add_gate(config.gates[i]);
        }
    };

    Fortress.prototype.select_gates = function (user, patterns) {
        var _this = this;
        return this.gates.filter(function (gate) {
            if (_this.user_has_any_role(user, gate.roles))
                for (var a = 0; a < patterns.length; ++a) {
                    for (var b = 0; b < gate.on.length; ++b) {
                        if (patterns[a] == gate.on[b])
                            return true;
                    }
                }
            return false;
        });
    };

    Fortress.prototype.atomic_access = function (user, resource, actions) {
        if (typeof actions === "undefined") { actions = []; }
        var gates = this.select_gates(user, actions);
        var details = {
            trellis: resource.trellis.name,
            seed: resource.seed
        };

        var promises = gates.map(function (gate) {
            return gate.check(user, resource).then(function (access) {
                return {
                    gate: gate,
                    access: access,
                    resource: details
                };
            });
        });

        return when.all(promises).then(function (results) {
            for (var i = 0; i < results.length; ++i) {
                if (results[i].access)
                    return results[i];
            }
            return {
                gate: null,
                access: false,
                resource: details
            };
        });
    };

    Fortress.prototype.get_explicit_query_properties = function (query) {
        if (!query.properties)
            return [];

        var result = [];
        for (var i in query.properties) {
            var property = query.properties;
            result.push(property);
        }

        return result;
    };

    Fortress.prototype.get_query_events = function (query) {
        var result = [
            'all',
            '*.query',
            query.trellis.name + '.query',
            query.trellis.name + '.*'
        ];

        return result;
    };

    Fortress.prototype.get_query_and_subqueries = function (user, query) {
        var result = [this.atomic_access(user, query, this.get_query_events(query))];

        var properties = this.get_explicit_query_properties(query);
        return when.all(result);
    };

    Fortress.prototype.query_access = function (user, query) {
        var _this = this;
        if (typeof user !== 'object')
            throw new Error('Fortress.update_access() requires a valid user object, not "' + user + '".');

        return this.get_roles(user).then(function () {
            return when.all(_this.get_query_and_subqueries(user, query)).then(function (results) {
                for (var i = 0; i < results.length; ++i) {
                    if (!results[i].access)
                        return {
                            gate: null,
                            access: false
                        };
                }
                return {
                    gate: null,
                    access: true
                };
            });
        });
    };

    Fortress.prototype.update_access = function (user, updates) {
        var _this = this;
        return this.get_roles(user).then(function () {
            if (!MetaHub.is_array(updates))
                updates = [updates];

            if (typeof user !== 'object')
                throw new Error('Fortress.update_access() requires a valid user object, not "' + user + '".');

            var promises = updates.map(function (update) {
                return _this.atomic_access(user, update, ['all', update.get_access_name(), '*.update', update.trellis.name + '.*']);
            });

            return when.all(promises).then(function (results) {
                for (var i = 0; i < results.length; ++i) {
                    var result = results[i];
                    if (!result.access)
                        return result;
                }
                return {
                    gate: null,
                    access: true
                };
            });
        });
    };

    Fortress.sequential_check = function (list, next, check) {
        var def = when.defer();
        var index = 0;
        var iteration = function (result) {
            if (check(result)) {
                def.resolve(result);
                return;
            }

            if (++index >= list.length) {
                def.reject(result);
                return;
            }

            return next(list[index]).then(iteration);
        };

        next(list[0]).done(iteration);

        return def.promise;
    };
    return Fortress;
})(Vineyard.Bulb);

var Fortress;
(function (Fortress) {
    var Gate = (function (_super) {
        __extends(Gate, _super);
        function Gate(fortress, source) {
            _super.call(this);
            this.fortress = fortress;
            this.on = source.on;
            if (!source.roles || source.roles.length == 0)
                throw new Error('Each gate requires at least one role.');

            this.roles = source.roles;
        }
        Gate.prototype.check = function (user, resource, info) {
            if (typeof info === "undefined") { info = null; }
            return when.resolve(false);
        };
        return Gate;
    })(MetaHub.Meta_Object);
    Fortress.Gate = Gate;

    var Admin = (function (_super) {
        __extends(Admin, _super);
        function Admin() {
            _super.apply(this, arguments);
        }
        Admin.prototype.check = function (user, resource, info) {
            if (typeof info === "undefined") { info = null; }
            return when.resolve(true);
        };
        return Admin;
    })(Gate);
    Fortress.Admin = Admin;

    var User_Content = (function (_super) {
        __extends(User_Content, _super);
        function User_Content() {
            _super.apply(this, arguments);
        }
        User_Content.prototype.check_rows_ownership = function (user, rows) {
            if (rows.length == 0)
                throw new Error('No records were found to check ownership.');
            for (var i = 0; i < rows.length; ++i) {
                var row = rows[i];
                if (row['author'] != user.id)
                    return false;
            }
            return true;
        };

        User_Content.is_open_query = function (query) {
            var filters = query.property_filters.filter(function (filter) {
                return filter.property == query.trellis.primary_key;
            });
            return filters.length == 0;
        };

        User_Content.prototype.check = function (user, resource, info) {
            if (typeof info === "undefined") { info = null; }
            var _this = this;
            if (resource.type == 'query') {
                if (this.limited_to_user(resource, user))
                    return when.resolve(true);

                if (User_Content.is_open_query(resource))
                    return when.resolve(true);

                return resource.run_core().then(function (rows) {
                    return _this.check_rows_ownership(user, rows);
                });
            } else {
                var id = resource.seed[resource.trellis.primary_key];

                if (!id)
                    return when.resolve(true);

                var query = this.fortress.ground.create_query(resource.trellis.name);
                query.add_key_filter(id);
                return query.run_core().then(function (rows) {
                    return rows.length == 0 || _this.check_rows_ownership(user, rows);
                });
            }
        };

        User_Content.prototype.limited_to_user = function (query, user) {
            var filters = query.property_filters.filter(function (filter) {
                return filter.property == 'user';
            });
            if (filters.length !== 1)
                return false;

            return filters[0].value == user.id;
        };
        return User_Content;
    })(Gate);
    Fortress.User_Content = User_Content;

    var Link = (function (_super) {
        __extends(Link, _super);
        function Link(fortress, source) {
            _super.call(this, fortress, source);
            this.paths = source.paths.map(Ground.path_to_array);
        }
        Link.prototype.check_path = function (path, user, resource) {
            var args, id = resource.get_primary_key_value();

            if (id === undefined)
                return when.resolve(false);

            if (path[0] == 'user')
                args = [user.id, id];
            else
                args = [id, user.id];

            return Ground.Query.query_path(path, args, this.fortress.ground);
        };

        Link.prototype.check = function (user, resource, info) {
            if (typeof info === "undefined") { info = null; }
            var _this = this;
            return Fortress.sequential_check(this.paths, function (path) {
                return _this.check_path(path, user, resource);
            }, function (result) {
                return result && result.total > 0;
            }).then(function (result) {
                return true;
            }, function (result) {
                return false;
            });
        };
        return Link;
    })(Gate);
    Fortress.Link = Link;
})(Fortress || (Fortress = {}));
require('source-map-support').install();
//# sourceMappingURL=fortress.js.map
module.exports = Fortress
