//declare function require(name:string):any;
/// <reference path="references.ts"/>
/// <reference path="../defs/metahub.d.ts"/>
/// <reference path="../defs/ground.d.ts"/>
/// <reference path="../defs/vineyard.d.ts"/>

//var MetaHub = require('metahub')
var fs = require('fs')

class Fortress extends Vineyard.Bulb {
  gate_types = {}
  gates:Fortress.Gate[] = []
  log:boolean = false

  add_gate(source:Fortress.Gate_Source) {
    var type = this.gate_types[source.type]
    if (!type)
      throw new Error('Could not find gate: "' + source.type + '".')

    var gate = new type(this, source)
    gate.name = source.type
    this.gates.push(gate)
  }

  get_roles(user):Promise {
    if (user.roles)
      return when.resolve(user.roles)

    var query = this.ground.create_query('role')
    query.add_filter('users', user.id)
    var runner = query.create_runner()
    return runner.run_core()
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
    if (this.log) {
      console.log('access.user', user.name, user.id, user.roles)
      console.log('access.actions', actions)
      console.log('access.gates', gates.map((x)=> x.name))
    }
    var details = {
      trellis: resource.trellis.name,
      seed: resource.seed
    }

    var promises = gates.map((gate)=>
        gate.check(user, resource)
          .then((access) => {
            return {
              gate: gate,
              access: access,
              resource: details
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
          access: false,
          resource: details
        }
      }
    )
  }

  get_explicit_query_properties(query:Ground.Query_Builder):any[] {
    if (!query.properties)
      return []

    var result = []
    for (var i in query.properties) {
      var property = query.properties
      result.push(property)
    }

    return result
  }

  get_query_events(query:Ground.Query_Builder):any[] {
    var result = [
      'all',
      '*.query',
      query.trellis.name + '.query',
      query.trellis.name + '.*'
    ]

    return result
  }

  private get_query_and_subqueries(user:Vineyard.IUser, query:Ground.Query_Builder):Promise {
    var result = [ this.atomic_access(user, query, this.get_query_events(query)) ]

    var properties = this.get_explicit_query_properties(query)
    return when.all(result)
  }

  query_access(user:Vineyard.IUser, query:Ground.Query_Builder):Promise {
    if (typeof user !== 'object')
      throw new Error('Fortress.update_access() requires a valid user object, not "' + user + '".')

    if (!user.roles)
      throw new Error('User passed to update_access is missing a roles array.')

    return when.all(this.get_query_and_subqueries(user, query))
      .then((results)=> {
        for (var i = 0; i < results.length; ++i) {
          var result = results[i]
          if (!result.access) {
            if (this.log)
              console.log('Query failed: ', result)

            return result
          }
        }
        return {
          gate: null,
          access: true
        }
      })
  }

  update_access(user:Vineyard.IUser, updates):Promise {
    if (typeof user !== 'object')
      throw new Error('Fortress.update_access() requires a valid user object, not "' + user + '".')

    if (!user.roles)
      throw new Error('User passed to update_access is missing a roles array.')

    if (!MetaHub.is_array(updates))
      updates = [ updates ]

    var promises = updates.map((update)=> {
      return this.atomic_access(user, update, ['all', update.get_access_name(), '*.update', update.trellis.name + '.*'])
    })

    // An unoptimized poor-man's method of checking.  In the long run the processing should
    // be sequential instead of processing everything at once.
    return when.all(promises)
      .then((results)=> {
        for (var i = 0; i < results.length; ++i) {
          var result = results[i]
          if (!result.access)
            return result
        }
        return {
          gate: null,
          access: true
        }
      }
    )
  }

  static sequential_check(list:any[], next:(arg)=>Promise, check):Promise {
    var def = when.defer()
    var index = 0
    var iteration = (result)=> {
      if (check(result)) {
        def.resolve(result)
        return
      }

      if (++index >= list.length) {
        def.reject(result)
        return
      }

      return next(list[index])
        .then(iteration)
    }

    next(list[0])
      .done(iteration
//      ,
//        (error)=> { def.reject(error) }
      )

    return def.promise
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
    name:string

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
        if (row['author'] != user.id)
          return false
      }
      return true
    }

    private static is_open_query(query):boolean {
      var filters = query.filters.filter(
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

        if (!id) // No id means this must be a creation.  This case will always allow access.
          return when.resolve(true)

        var query = this.fortress.ground.create_query(resource.trellis.name)
        query.add_key_filter(id)
        var runner = query.create_runner()
        return runner.run_core()
          // No rows should result in 'true' because that means this is a creation,
          // and the new creation will definitely be owned by the current user
          .then((rows)=> rows.length == 0 || this.check_rows_ownership(user, rows))
      }
    }

    limited_to_user(query:Ground.Query_Builder, user:Vineyard.IUser):boolean {
      var filters = query.filters.filter((filter)=> filter.property.name == 'user')
      if (filters.length !== 1)
        return false

      return filters[0].value == user.id
    }
  }

  export class Link extends Gate {
    paths:string[]

    constructor(fortress:Fortress, source) {
      super(fortress, source)
      this.paths = source.paths.map(Ground.path_to_array)
    }

    check_path(path:string, user:Vineyard.IUser, resource):Promise {
      var args, id = resource.get_primary_key_value()

      // This whole gate is only meant for specific queries, not general ones.
      if (id === undefined)
        return when.resolve(false)

      if (path[0] == 'user')
        args = [user.id, id]
      else
        args = [id, user.id]

      return Ground.Query.query_path(path, args, this.fortress.ground)
    }

    check(user:Vineyard.IUser, resource, info = null):Promise {
      return Fortress.sequential_check(
        this.paths,
        (path)=> this.check_path(path, user, resource),
        (result)=> result && result.total > 0
      )
        .then(
        (result)=> true,
        (result)=> false
      )
    }
  }

}