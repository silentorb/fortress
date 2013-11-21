var Ground = require('ground');var Vineyard = require('vineyard');var when = require('when');var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var MetaHub = require('metahub');
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
        query.add_property_filter('users', user.guid);
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

        var promises = gates.map(function (gate) {
            return gate.check(user, resource);
        });

        return when.all(promises).then(function (results) {
            return results.indexOf(true) > -1;
        });
    };

    Fortress.prototype.query_access = function (user, query) {
        var _this = this;
        if (typeof user !== 'object')
            throw new Error('Fortress.update_access() requires a valid user object, not "' + user + '".');

        return this.get_roles(user).then(function () {
            return _this.atomic_access(user, query, [
                'all',
                '*.query',
                query.trellis.name + '.query',
                query.trellis.name + '.*'
            ]);
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
                return results.indexOf(false) === -1;
            });
        });
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
            for (var i = 0; i < rows.length; ++i) {
                var row = rows[i];
                if (row['user'] != user.guid)
                    return false;
            }
            return true;
        };

        User_Content.prototype.check = function (user, resource, info) {
            if (typeof info === "undefined") { info = null; }
            var _this = this;
            if (resource.type == 'query') {
                if (this.limited_to_user(resource, user))
                    return when.resolve(true);

                return resource.run_core().then(function (rows) {
                    return _this.check_rows_ownership(user, rows);
                });
            } else {
                var id = resource.seed[resource.trellis.primary_key];

                if (!id)
                    when.resolve(true);

                var query = this.fortress.ground.create_query(resource.trellis.name);
                query.add_key_filter(id);
                return query.run_core().then(function (rows) {
                    return rows.length == 0 || _this.check_rows_ownership(user, rows);
                });
            }
        };

        User_Content.prototype.limited_to_user = function (query, user) {
            var filters = query.property_filters.filter(function (filter) {
                return filter.name == 'user';
            });
            if (filters.length !== 1)
                return false;

            return filters[0].value == user.guid;
        };
        return User_Content;
    })(Gate);
    Fortress.User_Content = User_Content;

    var Link = (function (_super) {
        __extends(Link, _super);
        function Link(fortress, source) {
            _super.call(this, fortress, source);
            this.path = source.path;
        }
        Link.prototype.check = function (user, resource, info) {
            if (typeof info === "undefined") { info = null; }
            return when.resolve(true);
        };
        return Link;
    })(Gate);
    Fortress.Link = Link;
})(Fortress || (Fortress = {}));


module.exports = Fortress;

//# sourceMappingURL=Fortress.js.map
