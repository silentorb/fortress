//declare function require(name:string):any;
/// <reference path="references.ts"/>
/// <reference path="../defs/metahub.d.ts"/>
/// <reference path="../defs/ground.d.ts"/>
/// <reference path="../defs/vineyard.d.ts"/>
/// <reference path="../defs/node.d.ts"/>

//var MetaHub = require('metahub')
var fs = require('fs')

class Fortress extends Vineyard.Bulb {
  gate_types = {}
  gates:Fortress.Gate[] = []

  add_gate(source:Fortress.Gate_Source) {
    var type = this.gate_types[source.type]
    if (!type)
      throw new Error('Could not find gate: "' + source.type + '".')

    var gate = new type(this, source)
    this.gates.push(gate)
  }

  get_roles(user):Promise {
    if (user.roles)
      return when.resolve(user.roles)

    var query = this.ground.create_query('role')
    query.add_property_filter('users', user.id)
    return query.run_core()
      .then((roles)=> user.roles = roles)
  }

  user_has_role(user, role_name:string):boolean {
    for (var i in user.roles) {
      if (user.roles[i].name == role_name)
        return true
    }
    return false
  }

  user_has_any_role(user, role_names:string[]):boolean {
    for (var a in user.roles) {
      for (var b in role_names) {
        if (user.roles[a].name == role_names[b])
          return true
      }
    }
    return false
  }

  grow() {
    this.gate_types['admin'] = Fortress.Admin
    this.gate_types['user_content'] = Fortress.User_Content
    this.gate_types['link'] = Fortress.Link
    var json = fs.readFileSync(this.config.config_path, 'ascii')
    var config = JSON.parse(json)

    for (var i = 0; i < config.gates.length; ++i) {
      this.add_gate(config.gates[i])
    }
  }

  select_gates(user, patterns):Fortress.Gate[] {
    return this.gates.filter((gate) => {
      if (this.user_has_any_role(user, gate.roles))
        for (var a = 0; a < patterns.length; ++a) {
          for (var b = 0; b < gate.on.length; ++b) {
            if (patterns[a] == gate.on[b])
              return true
          }
        }
      return false
    })
  }

  atomic_access(user:Vineyard.IUser, resource, actions:string[] = []) {
    var gates = this.select_gates(user, actions)

    var promises = gates.map((gate)=>
        gate.check(user, resource)
          .then((access) => {
            return {
              gate: gate,
              access: access
            }
          }
        )
    )

    // An unoptimized poor-man's method of checking
    return when.all(promises)
      .then((results)=> {
        for (var i = 0; i < results.length; ++i) {
          if (results[i].access)
            return results[i]
        }
        return {
          gate: null,
          access: false
        }
      }
    )
  }

  query_access(user:Vineyard.IUser, query:Ground.Query):Promise {
    if (typeof user !== 'object')
      throw new Error('Fortress.update_access() requires a valid user object, not "' + user + '".')

    return this.get_roles(user)
      .then(()=>
        this.atomic_access(user, query, [
          'all',
          '*.query',
          query.trellis.name + '.query',
          query.trellis.name + '.*'
        ])
    )
  }

  update_access(user:Vineyard.IUser, updates):Promise {
    return this.get_roles(user)
      .then(()=> {
        if (!MetaHub.is_array(updates))
          updates = [ updates ]

        if (typeof user !== 'object')
          throw new Error('Fortress.update_access() requires a valid user object, not "' + user + '".')

        var promises = updates.map((update)=> {
          return this.atomic_access(user, update, ['all', update.get_access_name(), '*.update', update.trellis.name + '.*'])
        })

        // An unoptimized poor-man's method of checking.  In the long run the processing should
        // be sequential instead of processing everything at once.
        return when.all(promises)
          .then((results)=> {
            for (var i = 0; i < results.length; ++i) {
              if (!results[i].access)
                return {
                  gate: null,
                  access: false
                }
            }
            return {
              gate: null,
              access: true
            }
          }
        )
      })
  }
}

module Fortress {

  export interface Gate_Source {
    type:string
    on:string[]
  }

  export class Gate extends MetaHub.Meta_Object {
    fortress:Fortress
    roles:string[]
    on:string[]

    constructor(fortress:Fortress, source) {
      super()
      this.fortress = fortress
      this.on = source.on
      if (!source.roles || source.roles.length == 0)
        throw new Error('Each gate requires at least one role.')

      this.roles = source.roles
    }

    check(user:Vineyard.IUser, resource, info = null):Promise {
      return when.resolve(false)
    }
  }

  export class Admin extends Gate {
    check(user:Vineyard.IUser, resource, info = null):Promise {
      return when.resolve(true)
    }
  }

  export class User_Content extends Gate {

    private check_rows_ownership(user, rows) {
      if (rows.length == 0)
        throw new Error('No records were found to check ownership.')
      for (var i = 0; i < rows.length; ++i) {
        var row = rows[i]
        if (row['user'] != user.id)
          return false
      }
      return true
    }

    private static is_open_query(query):boolean {
      var filters = query.property_filters.filter(
        (filter)=> filter.property == query.trellis.primary_key
      )
      return filters.length == 0
    }

    check(user:Vineyard.IUser, resource, info = null):Promise {
      if (resource.type == 'query') {
        if (this.limited_to_user(resource, user))
          return when.resolve(true)

        if (User_Content.is_open_query(resource))
          return when.resolve(true)

        return resource.run_core()
          .then((rows)=> this.check_rows_ownership(user, rows))
      }
      else {
        var id = resource.seed[resource.trellis.primary_key]

        if (!id) // No id means this must be a creation.
          when.resolve(true)

        var query = this.fortress.ground.create_query(resource.trellis.name)
        query.add_key_filter(id)
        return query.run_core()
          // No rows should result in 'true' because that means this is a creation,
          // and the new creation will definitely be owned by the current user
          .then((rows)=> rows.length == 0 || this.check_rows_ownership(user, rows))
      }
    }

    limited_to_user(query:Ground.Query, user:Vineyard.IUser):boolean {
      var filters = query.property_filters.filter((filter)=>filter.property == 'user')
      if (filters.length !== 1)
        return false

      return filters[0].value == user.id
    }
  }

  export class Link extends Gate {
    paths:string[]

    constructor(fortress:Fortress, source) {
      super(fortress, source)
      this.paths = source.paths
    }

    check_path(path:string, user:Vineyard.IUser, resource):Promise {
      var id = resource.get_primary_key_value()

      // This whole gate is only meant for specific queries, not general ones.
      if (id === undefined)
        return when.resolve(false)

      return Ground.Query.query_path(path, [user.id, id], this.fortress.ground)
    }

    check(user:Vineyard.IUser, resource, info = null):Promise {
      var promises = this.paths.map((x)=> this.check_path(x, user, resource))
      return when.all(promises)
        .then((results)=> {
          for (var i = 0; i < results.length; ++i) {
            if (results[i] && results[i].total > 0)
              return true
          }
          return false
        })
    }
  }

}