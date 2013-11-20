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

    var rule = new type(this)

    for (var i = 0; i < source.on.length; ++i) {
      var on = source.on[i]
      rule.listen(this, on, rule.check)
    }

    this.gates.push(rule)
  }

  get_roles(user):Promise {
    if (user.roles)
      return when.resolve(user.roles)

    var query = this.ground.create_query('role')
    query.add_property_filter('users', user.guid)
    return query.run()
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

    return this.atomic_access(user, query, [query.trellis.name + '.query', '*.query'])
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
      return this.atomic_access(user, update, [update.get_access_name(), '*.update'])
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
    check(user:Vineyard.IUser, resource, info):Promise {
      return this.fortress.user_has_role(user, 'user')
        .then((result)=> {
          if (!result)
            return false

          return
        })
    }
  }
}

export = Fortress