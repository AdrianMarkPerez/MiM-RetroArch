var gl = null;
var texture_ = null;
var texture_fbo_ = null;
var fbo_ = null;
var prog = null;
var prog2 = null;
var vert_buf = null;
var vert_buf_fbo = null;
var frame_count = 0;
var first_ = true;
var exception_ = null;
var original_size_ = null;
var slangp_ = null;

console.log("@-- parsing crt-demo");
function do_resize(scale) {
  var canvas = document.getElementById("test_canvas");
  canvas.width = texture_.image.width * scale;
  canvas.height = texture_.image.height * scale;
  var output = document.getElementById("total_scale_output");
  output.innerHTML = scale + "x";
}

class Enum {
  constructor(value){this.value = value;}

  static Get(value) {
    for (const v of Object.values(this)) {
      if (this.isPrototypeOf(v) && v.value==value) return v;
    }
    return null;
  }
};

class ScaleType extends Enum {
  static Source = new ScaleType("source");
  static Viewport = new ScaleType("viewport");
};

class Size {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }  
}

class Parameter {
  constructor(label, docstring, start_value, min_value, max_value, step) {
    this.label = label;
    this.docstring = docstring;
    this.start_value = start_value;
    this.min_value = min_value;
    this.max_value = max_value;
    this.step = step;
  }
};

class ParameterSet {
  constructor(params){
    this.params = params;
    this.lookup = new Map();
    var idx=0;
    for (var param of params) {
      this.lookup.set(param.label, idx++);
    }
  }
  mergeWith = function(other) {
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

  constructor(){}

  compile = function() {
    //alert("compiling " +this.shader);
    var shader = loadFile(this.shader);

    var vert_s = null;
    var frag_s = null;
  
    var console = document.getElementById("error_console");
    //console.innerHTML = "Shader compile was successful!\n";
  
    if (shader == null) shader = getShader("default_shader");
  
    vert_s = gl.createShader(gl.VERTEX_SHADER);

    // remove #pragma stage, which is retroarch-specific.
    shader = shader
      .replace("#pragma stage vertex", "#if defined(VERTEX)")
      .replace("#pragma stage fragment", "#elif defined(FRAGMENT)")
      +"\n#endif\n";
      //alert("is this thing on?");
  //alert(shader);
    // slangp uses glsl 450
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
      // alert("Vertex shader failed to compile!");
      console.innerHTML += "Vertex errors in "+ this.shader+":\n" + gl.getShaderInfoLog(vert_s);
      return;
    }
    var log = gl.getShaderInfoLog(vert_s);
    if (log.length > 0) {
      console.innerHTML += "Vertex warnings:\n" + log;
    }
  
    frag_s = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(
      frag_s,
      shader.replace(expected_v, required_v + "\n#define FRAGMENT\n")
    );
    gl.compileShader(frag_s);
    if (!gl.getShaderParameter(frag_s, gl.COMPILE_STATUS)) {
      // alert("Fragment shader failed to compile!");
      console.innerHTML += "Fragment errors in "+ this.shader+":\n" + gl.getShaderInfoLog(frag_s);
      return;
    }
    var log = gl.getShaderInfoLog(frag_s);
    if (log.length > 0) {
      console.innerHTML += "Fragment warnings:\n" + log;
    }
  
    gl.useProgram(null);
    if (this.program!==null) {
      gl.deleteProgram(this.program);
    }
  
    var program = gl.createProgram();
    gl.attachShader(program, vert_s);
    gl.attachShader(program, frag_s);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.innerHTML += "Linking errors:\n" + gl.getProgramInfoLog(program);
      return;
    }
  
    program.vert = vert_s;
    program.frag = frag_s;
  
    program.vert_attr = gl.getAttribLocation(program, "Position");
    program.tex_attr = gl.getAttribLocation(program, "TexCoord");

    this.program = program;
  }
  scrapeParameters = function(){
    const re_parameter = /\#pragma parameter (\w+)\s+\"([^"]+)\"\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/;

    let params = []
    for (var line of loadFile(this.shader).split("\n")){
      var m = re_parameter.exec(line);
      if (m) {
        //alert("Neat! parameter!" + m);
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

  passes = []

  // shader0 = "shaders/MiM-CRT-Prep.slang"
  // filter_linear0 = "false"
  // srgb_framebuffer0 = "true"
  // scale_type_x0 = "source"
  // scale_x0 = "1.000000"
  // scale_type_y0 = "source"
  // scale_y0 = "1.000000"
  // alias0 = FirstPass

  constructor(slangp_text) {
    var lines = slangp_text.split("\n");
    this.passes = []
    for (const line of lines) {
      let m = Slangp.re_shaders.exec(line);
      if (m) {
        var pass_count = m[1];
        while (pass_count-->0) {
          this.passes.push(new Pass());
        }
      }
      m = Slangp.re_shader.exec(line);
      if (m) this.passes[m[1]].shader = "../"+m[2];
        // alert("@-- pass["+m[1]+"].shader = "+m[2]);}
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
    }

    //alert("@-- " + lines.length+" passes:"+this.passes.length + " ??"+(400+Number("20")));
  }
};

function desiredRes() {
  var output_res = document.getElementById("output_res").value;
  if (output_res == "480p") return new Size(640, 480);
  return null;
}

function checkResize() {
   if (first_){
      first_ = false;
      alert("@-- dr:" + Object.entries(desiredRes()));
   }
  //console.log("@--: dr: " + desired_res());
}

function do_fbo_scale(scale) {
  fbo_enabled = scale != 0;
  fbo_scale = scale;
  var output = document.getElementById("fbo_scale_output");
  if (fbo_enabled) {
    output.innerHTML = fbo_scale + "x";
  } else {
    output.innerHTML = "Off";
  }
  canvas.width = texture_.image.width * scale;
  canvas.height = texture_.image.height * scale;
}

function set_filter(smooth) {
  if (smooth) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  }
}

function do_filter1(smooth) {
  gl.bindTexture(gl.TEXTURE_2D, texture_);
  set_filter(smooth);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function do_filter2(smooth) {
  gl.bindTexture(gl.TEXTURE_2D, texture_fbo_);
  set_filter(smooth);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function initGL(canvas) {
  try {
    gl = canvas.getContext("webgl2");
    // if (gl == null) {
    //    gl = canvas.getContext("experimental-webgl");
    // }
    gl.viewportWidth = canvas.width;
    gl.viewportHeight = canvas.height;
  } catch (e) {}
  if (gl == null) {
    alert("Could not init WebGL ... :(");
  }
}

function set_image(img) {
  gl.bindTexture(gl.TEXTURE_2D, texture_);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

  // Would prefer clamp to border,
  // but GLES only supports CLAMP_TO_EDGE with NPOT textures.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function load_image(evt) {
  if (!(window.File && window.FileReader && window.FileList && window.Blob)) {
    alert("FileReader API not supported by this browser ...");
    return;
  }

  var file = evt.target.files[0];
  if (!file.type.match("image.*")) {
    alert("This is not an image file! :(");
    return;
  }

  loadImageFromFile(file);
}

function loadImageFromFile(file) {
  var reader = new FileReader();
  reader.onload = function (e) {
    texture_.old_img = texture_.image;
    texture_.image = new Image();
    texture_.image.onload = function () {
      if (texture_.image.width > 0 && texture_.image.height > 0) {
        try {
          set_image(texture_.image);
          do_resize(1);
        } catch (e) {
          texture_.image = texture_.old_img;
          alert(e);
        }
      } else {
        texture_.image = texture_.old_img;
      }

      var output = document.getElementById("image_output");
      output.innerHTML = "Enabled";

      var output = document.getElementById("filter1_output");
      output.innerHTML = "Point";
    };
    texture_.image.src = e.target.result;
  };

  reader.onerror = function (err) {
    alert("FileReader error: " + err.getMessage());
  };

  reader.readAsDataURL(file);
}

function loadTexture(url) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Because images have to be downloaded over the internet
  // they might take a moment until they are ready.
  // Until then put a single pixel in the texture so we can
  // use it immediately. When the image has finished downloading
  // we'll update the texture with the contents of the image.
  const level = 0;
  const internalFormat = gl.RGBA;
  const width = 1;
  const height = 1;
  const border = 0;
  const srcFormat = gl.RGBA;
  const srcType = gl.UNSIGNED_BYTE;
  const pixel = new Uint8Array([0, 0, 255, 255]); // opaque blue
  gl.texImage2D(
    gl.TEXTURE_2D,
    level,
    internalFormat,
    width,
    height,
    border,
    srcFormat,
    srcType,
    pixel
  );

  const image = new Image();
  image.onload = function () {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      level,
      internalFormat,
      srcFormat,
      srcType,
      image
    );

    // No, it's not a power of 2. Turn off mips and set
    // wrapping to clamp to edge
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  };
  image.src = url;

  return texture;
}

function getShader(id) {
  return document.getElementById(id).innerHTML;
}

function reset_image() {
  texture_.image.width = 0;
  texture_.image.height = 0;
  do_resize(1);
  var output = document.getElementById("image_output");
  output.innerHTML = "None";
}

function load_text(evt, index) {
  if (!(window.File && window.FileReader && window.FileList && window.Blob)) {
    alert("FileReader API not supported by this browser ...");
    return;
  }

  if (!window.DOMParser) {
    alert("No XML parser found :(");
    return;
  }

  var file = evt.target.files[0];
  if (!file.name.match("\\.glsl$")) {
    alert("Not a GLSL shader!");
    return;
  }

  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      //compile_shader(e.target.result, index);
    } catch (e) {
      alert(e);
    }

    var output;
    if (index === 0) {
      output = document.getElementById("text_output");
    } else if (index === 1) {
      output = document.getElementById("text_output2");
    }
    output.innerHTML = "";

    if (e.target.result != null) {
      output.innerHTML +=
        '<h5>Program</h5><textarea readonly cols="50" rows="10">' +
        e.target.result +
        "</textarea>";
    }
  };

  reader.readAsText(file);
}

function load_text0(evt) {
  load_text(evt, 0);
}

function load_text1(evt) {
  load_text(evt, 1);
}

//  document.getElementById("image_file").addEventListener("change", load_image, false);
//  document.getElementById("shader_file").addEventListener("change", load_text0, false);
//  document.getElementById("shader_file2").addEventListener("change", load_text1, false);

function loadFile(filePath) {
  var result = null;
  var xmlhttp = new XMLHttpRequest();
  xmlhttp.open("GET", filePath, false);
  xmlhttp.send();
  if (xmlhttp.status==200) {
    result = xmlhttp.responseText;
  }
  return result;
}
function initShaders() {
  alert("Yay Tacos!");
  slangp_ = new Slangp(loadFile("../MiM-CRT-3pass.slangp"));

  var merged_params = new ParameterSet([]);
  for (var pass of slangp_.passes) {
    pass.compile();
    pass.scrapeParameters();
    merged_params.mergeWith(pass.parameter_set);
  }
  alert("compiled " + slangp_.passes.length + " passes with " + merged_params.params.length + " parameters");

  //compile_shader(loadFile("../shaders/MiM-CRT-Prep.slang"), 0);

  //reset_shader();
  //reset_shader2();

  texture_ = gl.createTexture();
  texture_.image = new Image();
  texture_.image.width = 0;
  texture_.image.height = 0;
  gl.bindTexture(gl.TEXTURE_2D, texture_);
}

function initFramebuffer() {
  texture_fbo_ = gl.createTexture();
  fbo_ = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo_);
  fbo_.width = 256;
  fbo_.height = 256;

  gl.bindTexture(gl.TEXTURE_2D, texture_fbo_);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    fbo_.width,
    fbo_.height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture_fbo_,
    0
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function initBuffers() {
  vert_buf_fbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vert_buf_fbo);

  var fbo_coords = [
    // Non-flipped.
    // TEX      // VERT
    0.0, 1.0, -1.0, +1.0, 
    1.0, 1.0, +1.0, +1.0, 
    0.0, 0.0, -1.0, -1.0,
    1.0, 0.0, +1.0, -1.0,
  ];

  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(fbo_coords), gl.STATIC_DRAW);

  vert_buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vert_buf);

  var coords = [
    // Flipped.
    // TEX      // VERT
    0.0, 0.0, -1.0, +1.0, 
    1.0, 0.0, +1.0, +1.0, 
    0.0, 1.0, -1.0, -1.0,
    1.0, 1.0, +1.0, -1.0,
  ];
  coords.size = 4;

  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(coords), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

function do_render_regular() {
  gl.clear(gl.COLOR_BUFFER_BIT);
  var canvas = document.getElementById("test_canvas");

  var output = document.getElementById("geometry");
  output.innerHTML =
    "<b>Geometry</b> " + "Canvas @ " + canvas.width + "x" + canvas.height;

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.useProgram(prog);
  gl.bindTexture(gl.TEXTURE_2D, texture_);

  gl.viewportWidth = canvas.width;
  gl.viewportHeight = canvas.height;

  gl.bindBuffer(gl.ARRAY_BUFFER, vert_buf);
  gl.vertexAttribPointer(prog.tex_attr, 2, gl.FLOAT, false, 4 * 4, 0 * 4);
  gl.vertexAttribPointer(prog.vert_attr, 2, gl.FLOAT, false, 4 * 4, 2 * 4);
  gl.enableVertexAttribArray(prog.tex_attr);
  gl.enableVertexAttribArray(prog.vert_attr);

  gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
  gl.uniform2f(
    gl.getUniformLocation(prog, "TextureSize"),
    texture_.image.width,
    texture_.image.height
  );
  gl.uniform2f(
    gl.getUniformLocation(prog, "InputSize"),
    texture_.image.width,
    texture_.image.height
  );
  gl.uniform2f(
    gl.getUniformLocation(prog, "OutputSize"),
    gl.viewportWidth,
    gl.viewportHeight
  );
  gl.uniform1i(gl.getUniformLocation(prog, "FrameCount"), frame_count);

  var identity_raw = [
    1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0,
    1.0,
  ];
  var identity = new Float32Array(identity_raw);
  gl.uniformMatrix4fv(
    gl.getUniformLocation(prog, "MVPMatrix"),
    false,
    identity
  );

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.disableVertexAttribArray(prog.tex_attr);
  gl.disableVertexAttribArray(prog.vert_attr);
  gl.useProgram(null);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function do_render_fbo() {
  var out_width = texture_.image.width * fbo_scale;
  var out_height = texture_.image.height * fbo_scale;

  if (out_width != fbo_.width || out_height != fbo_.height) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo_);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      null,
      0
    );
    gl.bindTexture(gl.TEXTURE_2D, texture_fbo_);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      out_width,
      out_height,
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
      texture_fbo_,
      0
    );
    fbo_.width = out_width;
    fbo_.height = out_height;
  }

  var canvas = document.getElementById("test_canvas");
  var output = document.getElementById("geometry");
  output.innerHTML =
    "<b>Geometry</b> " +
    "FBO @ " +
    fbo_.width +
    "x" +
    fbo_.height +
    ", Canvas @ " +
    canvas.width +
    "x" +
    canvas.height;

  gl.useProgram(prog);
  gl.bindTexture(gl.TEXTURE_2D, texture_);

  gl.bindBuffer(gl.ARRAY_BUFFER, vert_buf_fbo);
  prog.vert_attr = gl.getAttribLocation(prog, "VertexCoord");
  prog.tex_attr = gl.getAttribLocation(prog, "TexCoord");
  gl.enableVertexAttribArray(prog.tex_attr);
  gl.enableVertexAttribArray(prog.vert_attr);
  gl.vertexAttribPointer(prog.tex_attr, 2, gl.FLOAT, false, 4 * 4, 0 * 4);
  gl.vertexAttribPointer(prog.vert_attr, 2, gl.FLOAT, false, 4 * 4, 2 * 4);

  gl.bindTexture(gl.TEXTURE_2D, texture_);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo_);
  gl.viewport(0, 0, fbo_.width, fbo_.height);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.uniform1i(gl.getUniformLocation(prog, "Texture"), 0);
  gl.uniform2f(
    gl.getUniformLocation(prog, "TextureSize"),
    texture_.image.width,
    texture_.image.height
  );
  gl.uniform2f(
    gl.getUniformLocation(prog, "InputSize"),
    texture_.image.width,
    texture_.image.height
  );
  gl.uniform2f(
    gl.getUniformLocation(prog, "OutputSize"),
    fbo_.width,
    fbo_.height
  );
  gl.uniform1i(gl.getUniformLocation(prog, "FrameCount"), frame_count);

  var identity_raw = [
    1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0,
    1.0,
  ];
  var identity = new Float32Array(identity_raw);
  gl.uniformMatrix4fv(
    gl.getUniformLocation(prog, "MVPMatrix"),
    false,
    identity
  );

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.disableVertexAttribArray(prog.vert_attr);
  gl.disableVertexAttribArray(prog.tex_attr);

  gl.useProgram(prog2);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, texture_fbo_);

  gl.viewportWidth = canvas.width;
  gl.viewportHeight = canvas.height;
  gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.bindBuffer(gl.ARRAY_BUFFER, vert_buf);

  prog2.vert_attr = gl.getAttribLocation(prog2, "VertexCoord");
  prog2.tex_attr = gl.getAttribLocation(prog2, "TexCoord");
  gl.enableVertexAttribArray(prog2.vert_attr);
  gl.enableVertexAttribArray(prog2.tex_attr);
  gl.vertexAttribPointer(prog2.tex_attr, 2, gl.FLOAT, false, 4 * 4, 0 * 4);
  gl.vertexAttribPointer(prog2.vert_attr, 2, gl.FLOAT, false, 4 * 4, 2 * 4);

  gl.uniform1i(gl.getUniformLocation(prog2, "Texture"), 0);
  gl.uniform2f(
    gl.getUniformLocation(prog2, "TextureSize"),
    fbo_.width,
    fbo_.height
  );
  gl.uniform2f(
    gl.getUniformLocation(prog2, "InputSize"),
    fbo_.width,
    fbo_.height
  );
  gl.uniform2f(
    gl.getUniformLocation(prog2, "OutputSize"),
    gl.viewportWidth,
    gl.viewportHeight
  );
  gl.uniformMatrix4fv(
    gl.getUniformLocation(prog2, "MVPMatrix"),
    false,
    identity
  );
  gl.uniform1i(gl.getUniformLocation(prog2, "FrameCount"), frame_count);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.disableVertexAttribArray(prog2.vert_attr);
  gl.disableVertexAttribArray(prog2.tex_attr);

  gl.useProgram(null);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function do_render() {
  window.requestAnimFrame(do_render);
  try {
     if (exception_) return;
   //  if (texture_.image.width == 0 && texture_.image.height == 0) return;

    checkResize();

    frame_count += 1;
    if (fbo_enabled) {
      do_render_fbo();
    } else {
      do_render_regular();
    }

    var output = document.getElementById("frame_count");
    output.innerHTML = "<b>Frames</b> " + frame_count;

    gl.flush();
  } catch (e) {
    alert("do_render() Exception: " + e);
    exception_ = e;
  }
}

function webGLStart() {
  console.log("@-- webGLStart");
  try {
    var canvas = document.getElementById("test_canvas");
    initGL(canvas);
    initFramebuffer();
    alert("the hell?");
    initShaders();
    initBuffers();
    var t = loadTexture("./fusion1.png");

    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);

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
    alert("webGLStart() Exception: " + e);
  }
}
