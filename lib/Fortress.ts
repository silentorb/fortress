//declare function require(name:string):any;
/// <reference path="../defs/metahub.d.ts"/>
/// <reference path="../defs/ground.d.ts"/>
/// <reference path="../defs/vineyard.d.ts"/>
/// <reference path="../defs/node.d.ts"/>

import MetaHub = require('metahub')
import fs = require('fs')

class Fortress extends Vineyard.Bulb {
  gate_types = {}
  gates:Fortress.Gate[] = []

  add_gate(source:Fortress.Gate_Source) {
    var type = this.gate_types[source.type]
    if (!type)
      throw new Error('Could not find gate: "' + source.type + '".')

    var gate = new type(this)
    gate.on = source.on

//    for (var i = 0; i < source.on.length; ++i) {
//      var on = source.on[i]
////      rule.listen(this, on, rule.check)
//    }

    this.gates.push(gate)
  }

  get_roles(user):Promise {
    if (user.roles)
      return when.resolve(user.roles)

    var query = this.ground.create_query('role')
    query.add_property_filter('users', user.guid)
    return query.run_core()
  }

  user_has_role(user, role_name):Promise {
    return this.get_roles(user)
      .then((roles) => {
        for (var i in roles) {
          if (roles[i].name == role_name)
            return true
        }
        return false
      })
  }

  grow() {
    this.gate_types['admin'] = Fortress.Admin
    this.gate_types['user_content'] = Fortress.User_Content
    var json = fs.readFileSync(this.config.config_path, 'ascii')
    var config = JSON.parse(json)

    for (var i = 0; i < config.gates.length; ++i) {
      this.add_gate(config.gates[i])
    }
  }

  query_access(user:Vineyard.IUser, query:Ground.Query):Promise {
    if (typeof user !== 'object')
      throw new Error('Fortress.update_access() requires a valid user object, not "' + user + '".')

    return this.atomic_access(user, query, [query.trellis.name + '.query', '*.query', query.trellis.name + '.*'])
  }

  atomic_access(user:Vineyard.IUser, resource, actions:string[] = []) {
    var promises = this.map_invoke('all', user, resource)

    var additional = actions.map((action)=>
        this.map_invoke(action, user, resource)
    )

    // Flatten array of arrays and add it to promises
    var promises:Promise[] = [].concat.apply(promises, additional)

    // An unoptimized poor-man's method of checking
    return when.all(promises)
      .then((results)=>
        results.indexOf(true) > -1
    )
  }

  update_access(user:Vineyard.IUser, updates):Promise {
    if (!MetaHub.is_array(updates))
      updates = [ updates ]

    if (typeof user !== 'object')
      throw new Error('Fortress.update_access() requires a valid user object, not "' + user + '".')

    var promises = updates.map((update)=> {
      return this.atomic_access(user, update, [update.get_access_name(), '*.update', update.trellis.name + '.*'])
    })

    // An unoptimized poor-man's method of checking
    return when.all(promises)
      .then((results)=>
        results.indexOf(false) === -1
    )
  }
}

module Fortress {

  export interface Gate_Source {
    type:string
    on:string[]
  }

  export class Gate extends MetaHub.Meta_Object {
    fortress:Fortress
    on:string[]

    constructor(fortress:Fortress) {
      super()
      this.fortress = fortress
    }

    check(user:Vineyard.IUser, resource, info):Promise {
      return when.resolve(false)
    }
  }

  export class Admin extends Gate {
    check(user:Vineyard.IUser, resource, info):Promise {
      return this.fortress.user_has_role(user, 'admin')
    }
  }

  export class User_Content extends Gate {

    private check_rows_ownership(user, rows) {
      for (var i = 0; i < rows.length; ++i) {
        var row = rows[i]
        if (row['user'] != user.guid)
          return false
      }
      return true
    }

    check(user:Vineyard.IUser, resource, info):Promise {
      return this.fortress.user_has_role(user, 'user')
        .then((result)=> {
          if (!result)
            return false

          if (resource.type == 'query') {
            if (this.limited_to_user(resource, user))
              return true

            return resource.run_core()
              .then((rows)=> this.check_rows_ownership(user, rows))
          }
          else {
            var id = resource.seed[resource.trellis.primary_key]

            if (!id) // No id means this must be a creation.
              return true

            var query = this.fortress.ground.create_query(resource.trellis.name)
            query.add_key_filter(id)
            return query.run_core()
              // No rows equates to true because that means this is a creation,
              // and the new creation will definitely be owned by the current user
              .then((rows)=> !rows || this.check_rows_ownership(user, rows))
          }
        })
    }

    limited_to_user(query:Ground.Query, user:Vineyard.IUser):boolean {
      var filters = query.property_filters.filter((filter)=>filter.name == 'user')
      if (filters.length !== 1)
        return false

      return filters[0].value == user.guid
    }
  }
}

export = Fortress