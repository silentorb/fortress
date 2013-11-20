var __extends = this.__extends || function (d, b) {
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

        var gate = new type(this);
        gate.on = source.on;

        this.gates.push(gate);
    };

    Fortress.prototype.get_roles = function (user) {
        if (user.roles)
            return when.resolve(user.roles);

        var query = this.ground.create_query('role');
        query.add_property_filter('users', user.guid);
        return query.run_core();
    };

    Fortress.prototype.user_has_role = function (user, role_name) {
        return this.get_roles(user).then(function (roles) {
            for (var i in roles) {
                if (roles[i].name == role_name)
                    return true;
            }
            return false;
        });
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

    Fortress.prototype.query_access = function (user, query) {
        if (typeof user !== 'object')
            throw new Error('Fortress.update_access() requires a valid user object, not "' + user + '".');

        return this.atomic_access(user, query, [query.trellis.name + '.query', '*.query', query.trellis.name + '.*']);
    };

    Fortress.prototype.atomic_access = function (user, resource, actions) {
        if (typeof actions === "undefined") { actions = []; }
        var _this = this;
        var promises = this.map_invoke('all', user, resource);

        var additional = actions.map(function (action) {
            return _this.map_invoke(action, user, resource);
        });

        var promises = [].concat.apply(promises, additional);

        return when.all(promises).then(function (results) {
            return results.indexOf(true) > -1;
        });
    };

    Fortress.prototype.update_access = function (user, updates) {
        var _this = this;
        if (!MetaHub.is_array(updates))
            updates = [updates];

        if (typeof user !== 'object')
            throw new Error('Fortress.update_access() requires a valid user object, not "' + user + '".');

        var promises = updates.map(function (update) {
            return _this.atomic_access(user, update, [update.get_access_name(), '*.update', update.trellis.name + '.*']);
        });

        return when.all(promises).then(function (results) {
            return results.indexOf(false) === -1;
        });
    };
    return Fortress;
})(Vineyard.Bulb);

var Fortress;
(function (Fortress) {
    var Gate = (function (_super) {
        __extends(Gate, _super);
        function Gate(fortress) {
            _super.call(this);
            this.fortress = fortress;
        }
        Gate.prototype.check = function (user, resource, info) {
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
            return this.fortress.user_has_role(user, 'admin');
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
            var _this = this;
            return this.fortress.user_has_role(user, 'user').then(function (result) {
                if (!result)
                    return false;

                if (resource.type == 'query') {
                    if (_this.limited_to_user(resource, user))
                        return true;

                    return resource.run_core().then(function (rows) {
                        return _this.check_rows_ownership(user, rows);
                    });
                } else {
                    var id = resource.seed[resource.trellis.primary_key];

                    if (!id)
                        return true;

                    var query = _this.fortress.ground.create_query(resource.trellis.name);
                    query.add_key_filter(id);
                    return query.run_core().then(function (rows) {
                        return !rows || _this.check_rows_ownership(user, rows);
                    });
                }
            });
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
})(Fortress || (Fortress = {}));


module.exports = Fortress;

//# sourceMappingURL=Fortress.js.map
