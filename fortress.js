var MetaHub = require('metahub');var Ground = require('ground');var Vineyard = require('vineyard');var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var Fortress = (function (_super) {
    __extends(Fortress, _super);
    function Fortress() {
        _super.apply(this, arguments);
    }
    Fortress.prototype.query_access = function (query) {
        return when.resolve(false);
    };
    return Fortress;
})(Vineyard.Bulb);
//# sourceMappingURL=fortress.js.map
module.exports = Fortress