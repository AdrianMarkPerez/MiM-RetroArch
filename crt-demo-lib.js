var gl = null;
var canvas_ = null;
var request_id = null;
var vert_buf = null;
var vert_buf_fbo = null;
var frame_count = 0;
var input_frame_count = 0;
var exception_ = null;
var original_size_ = null;
var slangp_ = null;
var desired_shader_ = null;
var shader_choice_ = null;
var video_source_ = null;

function logit(text) {
  var console = document.getElementById("error_console");
  console.innerHTML = console.innerHTML + text + "\n";
}
function checkGlError() {
  const err = gl.getError();
  if (err === gl.NO_ERROR) return;
  lookup = {};
  lookup[gl.INVALID_ENUM] = "gl.INVALID_ENUM";
  lookup[gl.INVALID_VALUE] = "gl.INVALID_VALUE";
  lookup[gl.INVALID_OPERATION] = "gl.INVALID_OPERATION";
  lookup[gl.INVALID_FRAMEBUFFER_OPERATION] = "gl.INVALID_FRAMEBUFFER_OPERATION";
  lookup[gl.OUT_OF_MEMORY] = "gl.OUT_OF_MEMORY";
  lookup[gl.CONTEXT_LOST_WEBGL] = "gl.CONTEXT_LOST_WEBGL";

  throw Error("GL Error: " + lookup[err]);
}
function logExceptionsWithContext(block, context) {
  try {
    if (exception_) return;
    block();
  } catch (e) {
    logit(context + " Exception: " + e.message + "\n" + e.stack);
    exception_ = e;
  }
}

class CustomError extends Error {
  constructor(...params) {
    // Pass remaining arguments (including vendor specific ones) to parent constructor
    super(...params);

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CustomError);
    }

    this.name = "CustomError";
    // Custom debugging information
    this.date = new Date();
  }
}

class Enum {
  constructor(value) { this.value = value; }

  static Get(value) {
    for (const v of Object.values(this)) {
      if (v.value === value) return v;
    }
    return null;
  }
};

class ScaleType extends Enum {
  static Source = new ScaleType("source");
  static Viewport = new ScaleType("viewport");
};

class OutputRes extends Enum {
  static SD = new OutputRes("480p");
  static HD = new OutputRes("720p");
  static FHD = new OutputRes("1080p");
  static QHD = new OutputRes("1440p");
  static UHD = new OutputRes("2160p");
};

class ShaderChoice extends Enum {
  static Crt1pass = new ShaderChoice("MiM-CRT-1pass");
  static Crt2pass = new ShaderChoice("MiM-CRT-2pass");
  static Crt3pass = new ShaderChoice("MiM-CRT-3pass");
  static Crt4pass = new ShaderChoice("MiM-CRT-4pass");
  static Nearest = new ShaderChoice("nearest");
  static Bilinear = new ShaderChoice("bilinear");
};

class Size {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }

  toString = function () {
    return "" + this.width + "x" + this.height;
  }
  isEqual = function (other) {
    return (Math.round(this.width) == Math.round(other.width)) &&
      (Math.round(this.height) == Math.round(other.height));
  }
};

class Parameter {
  constructor(label, docstring, start_value, min_value, max_value, step) {
    this.label = label;
    this.uniform_name = "params." + label;
    this.docstring = docstring;
    this.start_value = +start_value;
    this.value = +start_value;
    this.min_value = +min_value;
    this.max_value = +max_value;
    this.step = step;
  }
};

class ParameterSet {
  constructor(params) {
    this.params = params;
    this.lookup = new Map();
    var idx = 0;
    for (var param of params) {
      this.lookup.set(param.label, idx++);
    }
  }
  getParam = function (label) {
    return this.params[this.lookup.get(label)];
  }
  mergeWith = function (other) {
    for (var [other_param_name, other_param_idx] of other.lookup) {
      const local_idx = this.lookup.get(other_param_name);
      if (local_idx === undefined) {
        // new parameter.
        this.lookup.set(other_param_name, this.params.length);
        this.params.push(other.params[other_param_idx]);
      } else {
        // TODO: retroarch validates parameters match
      }
    }
  }
};

class VideoSource {
  playing = false;
  time_update = false;
  copy_video = false;

  constructor(url) {
    const video = document.createElement('video');

    video.playsInline = true;
    video.autoplay = true;
    video.muted = true;
    video.loop = true;

    var that = this;

    video.addEventListener('playing', function () {
      that.playing = true;
      that.checkReady();
    }, true);

    video.addEventListener('timeupdate', function () {
      that.time_update = true;
      that.checkReady();
    }, true);

    video.src = url;
    video.play();

    this.video = video;
    this.texture = this.initTexture();
    this.size = null;
  }

  togglePlayback = function () {
    if (this.playing) {
      this.playing = false;
      this.copy_video = false;
      this.video.pause();
    } else {
      this.video.play();
    }
  }

  initTexture = function () {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, /*level=*/0,/*internalFormat=*/gl.RGBA,
    /*width=*/1,/*height=*/1,/*border=*/0,
    /*srcFormat=*/gl.RGBA,/*srcType=*/gl.UNSIGNED_BYTE,
    /*src=*/new Uint8Array([0, 0, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  // Waiting for these 2 events ensures
  // there is data in the video
  checkReady = function () {
    if (this.playing && this.time_update && !this.copy_video) {
      this.copy_video = true;
      this.size = new Size(this.video.videoWidth, this.video.videoHeight);
      // TODO: encode as data
      this.size = new Size(384,224);
      logit("Playing video with size " + this.size);
    }
  }

  preRender = function () {
    if (!this.copy_video) return;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, /*level=*/0,
      /*internalFormat=*/gl.RGBA,/*srcFormat=*/gl.RGBA,
      /*srcType=*/gl.UNSIGNED_BYTE, this.video);
  }
};

class Pass {
  shader = null;
  filter_linear = false;
  srgb_framebuffer = false;
  scale_type_x = ScaleType.Source;
  scale_type_y = ScaleType.Source;
  scale_x = 1.0;
  scale_y = 1.0;
  alias = null;
  program = null;
  parameter_set = null;
  sampler_uniforms = [];
  sampler_names = [];
  parameter_uniforms = [];

  constructor() { }

  compile = function () {
    var shader = resolveSourceFile(this.shader);

    var vert_s = null;
    var frag_s = null;
    logit("Shader compile was successful!");

    vert_s = gl.createShader(gl.VERTEX_SHADER);

    // remove #pragma stage, which is retroarch-specific.
    shader = shader
      .replace("#pragma stage vertex", "#if defined(VERTEX)")
      .replace("#pragma stage fragment", "#elif defined(FRAGMENT)")
      + "\n#endif\n";
    // slangp uses glsl 450; webgl2 uses glsl 300 es
    const expected_v = "#version 450";
    const required_v = "#version 300 es";
    var prefix = shader.slice(0, expected_v.length);
    if (prefix == expected_v) {
    }
    gl.shaderSource(
      vert_s,
      shader.replace(expected_v, required_v + "\n#define VERTEX\n")
    );
    gl.compileShader(vert_s);
    if (!gl.getShaderParameter(vert_s, gl.COMPILE_STATUS)) {
      logit("Vertex errors in " + this.shader + ":\n" + gl.getShaderInfoLog(vert_s));
      return;
    }
    var log = gl.getShaderInfoLog(vert_s);
    if (log.length > 0) {
      logit("Vertex warnings:\n" + log);
    }

    frag_s = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(
      frag_s,
      shader.replace(expected_v, required_v + "\n#define FRAGMENT\n")
    );
    gl.compileShader(frag_s);
    if (!gl.getShaderParameter(frag_s, gl.COMPILE_STATUS)) {
      logit("Fragment errors in " + this.shader + ":\n" + gl.getShaderInfoLog(frag_s));
      return;
    }
    var log = gl.getShaderInfoLog(frag_s);
    if (log.length > 0) {
      logit("Fragment warnings:\n" + log);
    }

    gl.useProgram(null);
    if (this.program !== null) {
      gl.deleteProgram(this.program);
    }

    var program = gl.createProgram();
    gl.attachShader(program, vert_s);
    gl.attachShader(program, frag_s);
    gl.linkProgram(program);
    gl.validateProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      logit("Linking errors:\n" + gl.getProgramInfoLog(program));
      return;
    }

    program.vert = vert_s;
    program.frag = frag_s;

    program.pos_attr = gl.getAttribLocation(program, "Position");
    program.tex_attr = gl.getAttribLocation(program, "TexCoord");

    this.program = program;
  }
  releaseResources = function () {
    gl.deleteProgram(this.program);
  }
  scrapeParameters = function () {
    const re_parameter = /\#pragma parameter (\w+)\s+\"([^"]+)\"\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/;

    let params = []
    for (var line of loadFile(this.shader).split("\n")) {
      var m = re_parameter.exec(line);
      if (m) {
        params.push(
          new Parameter(
            m[1], m[2],
            Number(m[3]),
            Number(m[4]),
            Number(m[5]),
            Number(m[6])));
      }
    }
    this.parameter_set = new ParameterSet(params);
  }
  handleBindings = function (passes, parameters) {
    const pass_aliases = passes.map(x => x.alias);
    const sampled_passes = passes.length - 1;
    var getUniformLocation = (x => gl.getUniformLocation(this.program, x));
    const dial_names = parameters.params.map(x => x.label);
    var source = getUniformLocation("Source");
    for (var sampled_pass = 0; sampled_pass < sampled_passes; ++sampled_pass) {
      var pass_n = getUniformLocation("Pass" + sampled_pass);
      var pass_feedback_n = getUniformLocation("PassFeedback" + sampled_pass);
      var alias_n = getUniformLocation("" + pass_aliases[sampled_pass]);
      if (pass_feedback_n) {

      }
      if (pass_n || alias_n) {
        //alert("TODO: pass" + sampled_pass);
      }
    }

    const uniform_count = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
    var uniform_index;
    for (uniform_index = 0; uniform_index < uniform_count; ++uniform_index) {
      var info = gl.getActiveUniform(this.program, uniform_index);
      var item = gl.getUniformLocation(this.program, info.name);
      switch (info.type) {
        case gl.SAMPLER_2D:
          this.sampler_uniforms.push(item);
          this.sampler_names.push(info.name);
          if (this.sampler_names.length != this.sampler_uniforms.length) throw Error("wtf");
          // logit("@-- tracking sampler n=" + this.sampler_names[this.sampler_names.length - 1] + ' u=' + this.sampler_uniforms[this.sampler_names.length - 1]);
          break;
        case gl.FLOAT:
          this.parameter_uniforms[info.name] = item;
          break;
      }
      // logit("Uniform " + uniform_index + ": " + info.name);
    }
  }
  uniformSize = function (name, size) {
    gl.uniform4f(gl.getUniformLocation(this.program, name), size.width, size.height, 1.0 / size.width, 1.0 / size.height);
  }
  uniformScalar = function (name, scalar) {
    gl.uniform1f(gl.getUniformLocation(this.program, name), scalar);
  }
  uniformInteger = function (name, integer) {
    gl.uniform1ui(gl.getUniformLocation(this.program, name), integer);
  }
  renderSize = function (source_size) {
    var width = 1;
    var height = 1;
    switch (this.scale_type_x) {
      case ScaleType.Source:
        width = source_size.width * this.scale_x;
        break;
      case ScaleType.Viewport:
        width = viewport_size_.width * this.scale_x;
        break;
    }
    switch (this.scale_type_y) {
      case ScaleType.Source:
        height = source_size.height * this.scale_y;
        break;
      case ScaleType.Viewport:
        height = viewport_size_.height * this.scale_y;
        break;
    }
    return new Size(width, height);
  }

};

class Framebuffer {
  tex_list = [];
  fbo_list = [];
  size = null;
  history_count = null;

  constructor(history_count, smooth, srgb) {
    var size = new Size(64, 64);//placeholder size
    logit('Creating Framebuffer (smooth='+smooth+', srgb='+srgb+')');
    for (var i = 0; i < history_count; ++i) {
      let tex = gl.createTexture();
      let fbo = gl.createFramebuffer();
      fbo.width = size.width;
      fbo.height = size.height;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(
      /*target=*/gl.TEXTURE_2D, /*level=*/0, /*internalformat=*/srgb ? gl.SRGB8_ALPHA8 : gl.RGBA,
      /*width=*/fbo.width, /*height=*/fbo.height, /*border=*/0,
      /*format=*/gl.RGBA, /*type=*/gl.UNSIGNED_BYTE, /*pixels=*/null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, smooth ? gl.LINEAR:gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        tex,
        0
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      this.tex_list.push(tex);
      this.fbo_list.push(fbo);
    }
    this.size = size;
    this.history_count = history_count;
    this.smooth = smooth;
    this.srgb = srgb;
  }
  releaseResources = function () {
    for (var i = 0; i < this.history_count; ++i) {
      gl.deleteTexture(this.tex_list[i]);
      gl.deleteFramebuffer(this.fbo_list[i]);
    }
  }
  resize = function (newsize) {
    logit("Resizing Framebuffer to " + newsize);
    for (var i = 0; i < this.history_count; ++i) {
      let fbo = this.fbo_list[i];
      let tex = this.tex_list[i];
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        null,
        0
      );
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        this.srgb ? gl.SRGB8_ALPHA8 : gl.RGBA,
        newsize.width,
        newsize.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        tex,
        0
      );
      fbo.width = newsize.width;
      fbo.height = newsize.height;
    }
    this.size = newsize;
  }

  currTex = function () {
    //logit("@-- currTex is " + ((frame_count) % this.history_count)+","+this.tex_list[(frame_count) % this.history_count]);
    return this.tex_list[input_frame_count % this.history_count];
  }
  prevTex = function () {
    //logit("@-- prevTex is " + ((frame_count+1) % this.history_count)+","+this.tex_list[(frame_count+1) % this.history_count]);
    return this.tex_list[(input_frame_count + this.history_count - 1) % this.history_count];
  }
  currFbo = function () {
    return this.fbo_list[input_frame_count % this.history_count];
  }
};

class Slangp {
  static re_shaders = /shaders = \"(\d+)\"/;
  static re_shader = /shader(\d+) = \"([^"]+)\"/;
  static re_filter_linear = /filter_linear(\d+) = \"(true|false)\"/;
  static re_srgb_framebuffer = /srgb_framebuffer(\d+) = \"(true|false)\"/;
  static re_scale_type_x = /scale_type_x(\d+) = \"(\w+)\"/;
  static re_scale_type_y = /scale_type_y(\d+) = \"(\w+)\"/;
  static re_scale_x = /scale_x(\d+) = \"(\d+(?:\.\d+)?)\"/;
  static re_scale_y = /scale_y(\d+) = \"(\d+(?:\.\d+)?)\"/;
  static re_alias = /alias(\d+) = (\w+)/;

  passes = [];
  framebuffers = [];
  param_set = null;
  alias_to_pass = {};

  constructor(slangp_text) {
    var lines = (slangp_text || "").split("\n");
    this.passes = []
    this.framebuffers = []
    for (const line of lines) {
      let m = Slangp.re_shaders.exec(line);
      if (m) {
        var pass_count = m[1];
        //while (pass_count-- > 0) {
        for (var i = 0; i < pass_count; ++i) {
          this.passes.push(new Pass());
          this.alias_to_pass["Pass" + i] = i;
        }
      }
      m = Slangp.re_shader.exec(line);
      if (m) this.passes[m[1]].shader = m[2];
      m = Slangp.re_filter_linear.exec(line);
      if (m) this.passes[m[1]].filter_linear = (m[2].toLowerCase() == "true");
      m = Slangp.re_srgb_framebuffer.exec(line);
      if (m) this.passes[m[1]].srgb_framebuffer = (m[2].toLowerCase() == "true");
      m = Slangp.re_scale_type_x.exec(line);
      if (m) this.passes[m[1]].scale_type_x = ScaleType.Get(m[2]);
      m = Slangp.re_scale_type_y.exec(line);
      if (m) this.passes[m[1]].scale_type_y = ScaleType.Get(m[2]);
      m = Slangp.re_scale_x.exec(line);
      if (m) this.passes[m[1]].scale_x = Number(m[2]);
      m = Slangp.re_scale_y.exec(line);
      if (m) this.passes[m[1]].scale_y = Number(m[2]);
      m = Slangp.re_alias.exec(line);
      if (m) this.passes[m[1]].alias = m[2];
      if (m) this.alias_to_pass[m[2]] = m[1];
    }

    // Each pass except the last gets a framebuffer to render to.
    var fb_count = this.passes.length - 1;
    for (var i=0;i<fb_count;++i){
      this.framebuffers.push(new Framebuffer(2, this.passes[i+1].filter_linear, this.passes[i].srgb_framebuffer));
    }
    // Last pass cannot be srgb
    if (this.passes[fb_count].srgb_framebuffer) throw Error("The backbuffer must be linear");

    var merged_params = new ParameterSet([]);
    for (const pass of this.passes) {
      pass.compile();
      if (pass.program === null) throw Error("Compilation Failure in "+this.shader);
      pass.scrapeParameters();
      merged_params.mergeWith(pass.parameter_set);
    }
    this.parameter_set = merged_params;

    for (const pass of this.passes) {
      pass.handleBindings(this.passes, this.parameter_set);
    }
  }

  createUI = function () {
    var table = document.getElementById("params");

    while (table.rows.length > 0) table.deleteRow(-1);

    for (const param of this.parameter_set.params) {
      let row = table.insertRow();
      let input_cell = row.insertCell();
      var input = document.createElement("input");
      input.type = "range";
      input.id = param.label;
      input.classList.add("param_input");

      const query_param_value = lookupQueryParam(param.label);
      if (query_param_value) param.value = query_param_value;

      input.name = param.label;
      input.min = param.min_value;
      input.max = param.max_value;
      input.step = param.step;
      input.value = param.value;
      input_cell.appendChild(input);

      let label_cell = row.insertCell();
      label_cell.appendChild(document.createTextNode(param.docstring));
      let value_cell = row.insertCell();
      const value_label = document.createTextNode("" + param.value);
      value_label.id = input.label + "_V";
      value_cell.appendChild(value_label);
      input.oninput =
        function () {
          logExceptionsWithContext(function () {
            const i = document.getElementById(param.label);
            param.value = i.value;
            value_label.nodeValue = i.value;
          }, "oninput");
        };
      input.onchange = function () {
        updateQueryParam(param.label, param.value);
      };
    }
  }

  releaseResources = function () {
    for (var pass of this.passes){
      pass.releaseResources();
    }
    for (var framebuffer of this.framebuffers){
      framebuffer.releaseResources();
    }
  }

  render = function (source) {
    if (!source.size) return;
    checkGlError();
    source.preRender();
    var size = source.size;

    const fb_count = this.framebuffers.length;
    var fb_index = 0;
    var source_tex = source.texture;
    var source_size = source.size;
    var original_source_size = source_size;
    // Build framebuffers from passes
    for (; fb_index < fb_count; ++fb_index) {
      var pass = this.passes[fb_index];
      var fb = this.framebuffers[fb_index];
      size = pass.renderSize(size);
      if (!size.isEqual(fb.size)) {
        fb.resize(size);
      }
      this.renderPass(fb_index, source_tex, source_size, original_source_size, fb);
      source_tex = fb.currTex();
      source_size = size;
    }
    checkGlError();
    // Render the last pass.
    var pass = this.passes[fb_index];
    this.renderPass(fb_index, source_tex, source_size, original_source_size, null);
    checkGlError();
    if (source.copy_video) {
      input_frame_count+= 1;
    }
    //throw new CustomError("debug frame done");
  }

  renderPass = function (i, tex, tex_size, original_tex_size, fb) {
    var pass = this.passes[i];
    if (!tex) throw new CustomError("tex fam");
    //logit("@-- " + tex + ',' + fb);
    let prog = pass.program;
    checkGlError();
    gl.useProgram(prog);
    checkGlError();
    gl.bindBuffer(gl.ARRAY_BUFFER, fb != null ? vert_buf : vert_buf_fbo);
    prog.pos_attr = gl.getAttribLocation(prog, "Position");
    prog.tex_attr = gl.getAttribLocation(prog, "TexCoord");
    gl.enableVertexAttribArray(prog.pos_attr);
    gl.enableVertexAttribArray(prog.tex_attr);
    gl.vertexAttribPointer(prog.pos_attr, 4, gl.FLOAT, false, 6 * 4, 0 * 4);
    gl.vertexAttribPointer(prog.tex_attr, 2, gl.FLOAT, false, 6 * 4, 4 * 4);
    // gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb ? fb.currFbo() : null);
    var fb_size;
    checkGlError();

    var sx = 1.;
    var sy = 1.;
    var ox = 0.;
    var oy = 0.;
    if (fb) {
      fb_size = fb.size;//new Size(fb.width, fb.height);
    } else {
      var canvas = document.getElementById("test_canvas");
      fb_size = new Size(canvas.width, canvas.height);
      gl.viewportWidth = canvas.width;
      gl.viewportHeight = canvas.height;
      const src_aspect_ratio = 4.0/3.0;//tex_size.width / tex_size.height;
      const dst_aspect_ratio = fb_size.width / fb_size.height;
      if (src_aspect_ratio <= dst_aspect_ratio) {
        const render_width = 2 * Math.round(fb_size.height * src_aspect_ratio / 2);
        //sx = render_width / fb_size.width;
        ox = (fb_size.width - render_width)/2;
        fb_size = new Size(render_width, fb_size.height);
      } else {
        logit("todo");
      }
    }
    gl.viewport(ox, 0, fb_size.width, fb_size.height);
    //logit("@-- Pass "+i+": "+tex_size+' -> '+fb_size + ' ('+original_tex_size+') s='+sx+'x'+sy);
    //gl.clear(gl.COLOR_BUFFER_BIT);
    checkGlError();

    //gl.uniform1i(gl.getUniformLocation(prog, "Source"), 0);
    pass.uniformSize("params.OriginalSize", original_tex_size);
    pass.uniformSize("params.SourceSize", tex_size);
    pass.uniformSize("params.OutputSize", fb_size);
    checkGlError();
    pass.uniformInteger("params.FrameCount", frame_count);
    checkGlError();
    for (const pass_param of pass.parameter_set.params) {
      var param = this.parameter_set.getParam(pass_param.label);
      //logit("@-- n="+param.uniform_name + " v="+param.value);
      pass.uniformScalar(param.uniform_name, param.value);
    }
    //sx=0.1;
    var identity_raw = [
      1.0 * sx, 0.0, 0.0, 0.0,
      0.0, -1.0 * sy, 0.0, 0.0,
      0.0, 0.0, 1.0, 0.0,
      0.0, 0.0, 0.0, 1.0];
    var identity = new Float32Array(identity_raw);
    gl.uniformMatrix4fv(gl.getUniformLocation(prog, "global.MVP"),
      false, identity);

    // hook up textures
    checkGlError();
    for (var i = 0; i < pass.sampler_uniforms.length; ++i) {
      const u = pass.sampler_uniforms[i];
      const n = pass.sampler_names[i];
      gl.uniform1i(u, i);
      checkGlError();
    }
    for (var i = 0; i < pass.sampler_uniforms.length; ++i) {
      const u = pass.sampler_uniforms[i];
      const n = pass.sampler_names[i];
      switch (i) {
        case 0: gl.activeTexture(gl.TEXTURE0); break;
        case 1: gl.activeTexture(gl.TEXTURE1); break;
        case 2: gl.activeTexture(gl.TEXTURE2); break;
        case 3: gl.activeTexture(gl.TEXTURE3); break;
        default: throw new CustomError("" + i + " is too much, man.");
      }
      checkGlError();
      var t = null;
      switch (n) {
        case "Source":
          t = tex;
          break;
        case "PassFeedback0":
          t = this.framebuffers[0].prevTex();
          break;
        default:
          const aliased_pass = this.alias_to_pass[n];
          if (aliased_pass !== null) { t = this.framebuffers[aliased_pass].currTex(); }
          break;
      }
      if (t == null) { throw new CustomError("Failed to resolve '" + n + "'"); }
      checkGlError();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, pass.filter_linear ? gl.LINEAR:gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      checkGlError();
      gl.uniform1i(u, i);
      checkGlError();
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(prog.pos_attr);
    gl.disableVertexAttribArray(prog.tex_attr);
    checkGlError();
  }
};

function updateQueryParam(k, v) {
  var searchParams = new URLSearchParams(window.location.search);
  searchParams.set(k, v);
  var newRelativePathQuery = window.location.pathname + '?' + searchParams.toString();
  history.pushState(null, '', newRelativePathQuery);
}

function lookupQueryParam(k) {
  var searchParams = new URLSearchParams(window.location.search);
  return searchParams.get(k);
}

function desiredShader() {
  return ShaderChoice.Get(document.getElementById("shader_choice").value);
}

function desiredShaderPath(desired_shader) {
  return desired_shader.value + ".slangp";
}

function desiredRes() {
  return OutputRes.Get(document.getElementById("output_res").value);
}

function desiredSize(desired_res) {
  switch (desired_res) {
    default:
    case OutputRes.SD: return new Size(640, 480);
    case OutputRes.HD: return new Size(1280, 720);
    case OutputRes.FHD: return new Size(1920, 1080);
    case OutputRes.QHD: return new Size(2560, 1440);
    case OutputRes.UHD: return new Size(3840, 2160);
  }
}

document.getElementById("output_res").onchange = function () {
  updateQueryParam('output_res', desiredShader().value);
};
document.getElementById("shader_choice").onchange = function () {
  updateQueryParam('shader_choice', desiredRes().value);
};

function checkResize() {
  const desired_res = desiredRes();
  const desired_size = desiredSize(desired_res);
  if (desired_size.width == canvas_.width &&
    desired_size.height == canvas_.height) return;
  canvas_.width = desired_size.width;
  canvas_.height = desired_size.height;

  var devicePixelRatio = window.devicePixelRatio || 1;

  // set the display size of the canvas.
  canvas_.style.width = (desired_size.width / devicePixelRatio) + "px";
  canvas_.style.height = (desired_size.height / devicePixelRatio) + "px";

  // set the size of the drawingBuffer
  canvas_.width = desired_size.width;
  canvas_.height = desired_size.height;

  logit("Changed resolution to " + desired_size);
}

function checkShaderChoice() {
  const desired_shader = desiredShader();
  if (desired_shader === shader_choice_) return;
  shader_choice_ = desired_shader;

  const desired_shader_path = desiredShaderPath(desired_shader);
  if (slangp_) slangp_.releaseResources();
  logit("Loading Shader: " + desired_shader_path);
  slangp_ = new Slangp(loadFile(desired_shader_path));
  slangp_.createUI();
}

function initGL() {
  try {
    gl = canvas_.getContext("webgl2");
    gl.viewportWidth = canvas_.width;
    gl.viewportHeight = canvas_.height;
  } catch (e) { }
  if (gl == null) {
    alert("Could not init WebGL ... :(");
  }
}

function loadFile(filePath) {
  var result = null;
  var xmlhttp = new XMLHttpRequest();
  xmlhttp.open("GET", filePath, false);
  xmlhttp.send();
  if (xmlhttp.status == 200) {
    result = xmlhttp.responseText;
  }
  return result;
}

function resolveSourceFile(file_path) {
  const re_include = /#include \"([^\"]+)\"/;
  logit("Loading: "+file_path);
  const lines = loadFile(file_path).split("\n");
  const out_lines = [];
  const base_path_parts = file_path.split("/").slice(0,-1);
  for (var i=0;i<lines.length;++i){
    const line = lines[i];
    var m = re_include.exec(line);
    if (m) {
      var path_parts = base_path_parts.slice();
      path_parts.push(m[1]);
      var other_lines = resolveSourceFile(path_parts.join("/")).split("\n");
      for (const other_line of other_lines){
        out_lines.push(other_line);
      }
      // todo: handle ../ in include paths
    } else {
      out_lines.push(line);
    }
  }
  return out_lines.join("\n")+"\n";
}

function initBuffers() {
  vert_buf_fbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vert_buf_fbo);

  var fbo_coords = [
    // Non-flipped.
    // pos                // tex
    -1.0, +1.0, 0.0, 1.0, 0.0, 1.0,
    +1.0, +1.0, 0.0, 1.0, 1.0, 1.0,
    -1.0, -1.0, 0.0, 1.0, 0.0, 0.0,
    +1.0, -1.0, 0.0, 1.0, 1.0, 0.0,
  ];

  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(fbo_coords), gl.STATIC_DRAW);

  vert_buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vert_buf);

  var coords = [
    // Flipped.
    // pos                // tex
    -1.0, +1.0, 0.0, 1.0, 0.0, 0.0,
    +1.0, +1.0, 0.0, 1.0, 1.0, 0.0,
    -1.0, -1.0, 0.0, 1.0, 0.0, 1.0,
    +1.0, -1.0, 0.0, 1.0, 1.0, 1.0,
  ];
  coords.size = 4;

  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(coords), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

var last_vis_ = null;
function do_render() {
  logExceptionsWithContext(function () {
    if (last_vis_ !== document.visibilityState) {
      logit("Doc vis now: " + document.visibilityState);
      last_vis_ = document.visibilityState;
    }

    checkResize();
    checkShaderChoice();

    request_id = window.requestAnimFrame(do_render);
    if (slangp_) {
      gl.disable(gl.BLEND);
      slangp_.render(video_source_);
    } else return;
    gl.flush();
    frame_count += 1;
    var output = document.getElementById("frame_count");
    output.innerHTML = "<b>Frames</b> " + frame_count;
  }, "do_render()");
}

function handleVisibilityChange() {
  if (document.hidden) {
    logit("Document is hidden");
    cancelRequestAnimationFrame(request_id_);
    // videoElement.pause();
  } else {
    logit("Document is visible");
    // videoElement.play();
    gl.clear(gl.COLOR_BUFFER_BIT);
    do_render();
  }
}
function webGLStart() {
  try {
    if (canvas_ === null) {
      // First run
      canvas_ = document.getElementById("test_canvas");
      canvas_.addEventListener("webglcontextlost", function (event) {
        logit("WebGL context lost");
        event.preventDefault();
        cancelRequestAnimationFrame(request_id_);
      }, false);
      document.addEventListener("visibilitychange", handleVisibilityChange, false);
      logit("first run");

      canvas_.addEventListener("webglcontextrestored", function (event) {
        logit("WebGL context restored");
        webGLStart();
      }, false);
      var shader_choice_param = lookupQueryParam('shader_choice');
      if (shader_choice_param!==null && shader_choice_param!==undefined){
        document.getElementById('shader_choice').value = shader_choice_param;
      }
      var output_res_param = lookupQueryParam('output_res');
      if (output_res_param!==null && output_res_param!==undefined){
        document.getElementById('output_res').value = output_res_param;
      }

      document.getElementById("output_res").onchange = function () {
        updateQueryParam('output_res', desiredRes().value);
      };
      document.getElementById("shader_choice").onchange = function () {
        updateQueryParam('shader_choice', desiredShader().value);
      };
      document.addEventListener('keydown', event => {
        if (event.code === 'Space') {
          event.preventDefault();
        }
      })
      document.addEventListener('keyup', event => {
        if (event.code === 'Space') {
          video_source_.togglePlayback();
          event.preventDefault();
        }
      })

    }
    initGL();
    video_source_ = new VideoSource("demo/sfa3_trim.mp4");
    initBuffers();

    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.disable(gl.BLEND);

    window.requestAnimFrame = (function () {
      return (
        window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.oRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        function (callback) {
          window.setTimeout(callback, 1000 / 60);
        }
      );
    })();
    do_render();
  } catch (e) {
    logit("do_render() Exception: " + e.message + "\n" + e.stack);
  }
}


