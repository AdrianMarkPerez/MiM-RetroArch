const mediump vec3 RGB_to_Y = vec3(0.299, 0.595716, 0.211456);

float CornerMask(vec2 coord, float sharpness, float aspect_ratio) {
	coord = (coord - vec2(.5))*1. + vec2(.5);
	coord = min(coord, vec2(1.) - coord)*vec2(1., aspect_ratio);
    vec2 cdist = vec2(params.CORNER_RADIUS);
	coord = (cdist - min(coord, cdist));
	float dist = length(coord);
	return clamp((cdist.x - dist)*sharpness, 0., 1.);
}

const float kBlockSize = 0.5;
const vec3 kOffsets = vec3(1./12., 3./12., 5./12.);
const float kPhosphorRadius = 0.8/12.;
const float kPhosphorRoundness = 0.75;
const float kPhosphorRoundRadius = kPhosphorRadius*kPhosphorRoundness;
const float kPhosphorBoxRadius = kPhosphorRadius*(1. - kPhosphorRoundness);
const float kPhosphorLineLength = 0.46*kBlockSize - kPhosphorRadius;
const vec3 kPhosphorHeightBase =vec3(kPhosphorLineLength*0.4);//~2.4 max
const vec3 kPhosphorHeightScale = vec3(kPhosphorLineLength*1.8);
const vec3 kPhosphorHeightMax = kPhosphorHeightBase + kPhosphorHeightScale;
const vec3 kPhosphorSpread = vec3(0.95);

vec3 CenterLit(vec3 tex, vec3 x_distances, float y_distance, float w, 
               vec3 phosphor_heights, vec3 strobe) {
    vec3 mask_heights = vec3(kPhosphorLineLength);
    vec3 y_distances_c = max(vec3(0.), vec3(y_distance) - phosphor_heights - kPhosphorBoxRadius);
    vec3 y_distances_m = max(vec3(0.), vec3(y_distance) - mask_heights - kPhosphorBoxRadius);
    vec3 distances_c = sqrt(x_distances*x_distances + y_distances_c*y_distances_c);
    vec3 distances_m = sqrt(x_distances*x_distances + y_distances_m*y_distances_m);
    float d = 3.;
    vec3 contrib = smoothstep(vec3(kPhosphorRadius + d*w),
                                vec3(kPhosphorRadius - d*w),
                                distances_c - min(distances_c, vec3(w)));
    vec3 mask = smoothstep(vec3(kPhosphorRoundRadius + d*w), 
                           vec3(kPhosphorRoundRadius - d*w),
                           distances_m - min(distances_m, vec3(w)));

    return contrib*strobe*mask*tex;
}

vec3 EdgeLit(vec3 tex_t, vec3 tex_b, vec3 x_distances, 
             float y_distance_t, float y_distance_m, float y_distance_b, float w, 
             vec3 phosphor_heights_t, vec3 phosphor_heights_b, vec3 strobe_t, vec3 strobe_b) {
    vec3 mask_heights = vec3(kPhosphorLineLength);
    vec3 y_distances_t = max(vec3(0.), vec3(y_distance_t) - phosphor_heights_t - kPhosphorBoxRadius);
    vec3 y_distances_m = max(vec3(0.), vec3(y_distance_m) - mask_heights - kPhosphorBoxRadius);
    vec3 y_distances_b = max(vec3(0.), vec3(y_distance_b) - phosphor_heights_b - kPhosphorBoxRadius);
    vec3 distances_t = sqrt(x_distances*x_distances + y_distances_t*y_distances_t);
    vec3 distances_m = sqrt(x_distances*x_distances + y_distances_m*y_distances_m);
    vec3 distances_b = sqrt(x_distances*x_distances + y_distances_b*y_distances_b);
    float d = 3.;
    vec3 mask = smoothstep(vec3(kPhosphorRoundRadius + d*w), vec3(kPhosphorRoundRadius - d*w), distances_m - min(distances_m, vec3(w)));
    vec3 contrib_t = smoothstep(vec3(kPhosphorRadius + d*w), vec3(kPhosphorRadius - d*w), distances_t - min(distances_t, vec3(w)));
    vec3 contrib_b = smoothstep(vec3(kPhosphorRadius + d*w), vec3(kPhosphorRadius - d*w), distances_b - min(distances_b, vec3(w)));
    return (contrib_t*tex_t*strobe_t + contrib_b*tex_b*strobe_b)*mask;
}

vec3 SplitLit(vec3 tex, vec3 x_distances,
              float y_distance_t, float y_distance_m, float y_distance_b, float w,
              vec3 phosphor_heights, vec3 strobe) {
    vec3 mask_heights = vec3(kPhosphorLineLength);
    vec3 y_distances_t = max(vec3(0.), vec3(y_distance_t) - mask_heights - kPhosphorBoxRadius);
    vec3 y_distances_m = max(vec3(0.), vec3(y_distance_m) - phosphor_heights - kPhosphorBoxRadius);
    vec3 y_distances_b = max(vec3(0.), vec3(y_distance_b) - mask_heights - kPhosphorBoxRadius);
    vec3 distances_t = sqrt(x_distances*x_distances + y_distances_t*y_distances_t);
    vec3 distances_m = sqrt(x_distances*x_distances + y_distances_m*y_distances_m);
    vec3 distances_b = sqrt(x_distances*x_distances + y_distances_b*y_distances_b);
    float d = 3.;
    vec3 mask = smoothstep(vec3(kPhosphorRoundRadius + d*w), vec3(kPhosphorRoundRadius - d*w), distances_t - min(distances_t, vec3(w))) +
                smoothstep(vec3(kPhosphorRoundRadius + d*w), vec3(kPhosphorRoundRadius - d*w), distances_b - min(distances_b, vec3(w)));
    vec3 contrib = smoothstep(vec3(kPhosphorRadius + d*w), vec3(kPhosphorRadius - d*w), distances_m - min(distances_m, vec3(w)));
    return contrib*tex*mask*strobe;
}

vec3 Phosphor(sampler2D phosphor_texture, vec2 ddx, vec2 ddy, vec2 pos, vec4 size, float aspect_ratio) {
    vec2 phosphor_texture_size = vec2(textureSize(phosphor_texture, 0));
	highp vec2 texel_real = pos * phosphor_texture_size;
    highp vec2 texel_center = floor(texel_real - vec2(0.5))+vec2(0.5);
	highp ivec2 texel_00 = ivec2(texel_center - vec2(0.5));
    mediump vec2 texel_frac = texel_real - texel_center;

    vec3 tex_00 = DecodeColor(texelFetch(phosphor_texture, texel_00, 0));
    vec3 tex_10 = DecodeColor(texelFetchOffset(phosphor_texture, texel_00, 0, ivec2(1,0)));
    vec3 tex_11 = DecodeColor(texelFetchOffset(phosphor_texture, texel_00, 0, ivec2(1,1)));
    vec3 tex_01 = DecodeColor(texelFetchOffset(phosphor_texture, texel_00, 0, ivec2(0,1)));

    // left/middle/right column
    vec3 cl_x = vec3(-0.25) + kOffsets;
    vec3 cm_x = vec3(0.25) + kOffsets;
    vec3 cr_x = vec3(0.75) + kOffsets;

    vec3 cl_dist_x = max(vec3(0.), abs(cl_x - texel_frac.xxx) - vec3(kPhosphorBoxRadius));
    vec3 cm_dist_x = max(vec3(0.), abs(cm_x - texel_frac.xxx) - vec3(kPhosphorBoxRadius));
    vec3 cr_dist_x = max(vec3(0.), abs(cr_x - texel_frac.xxx) - vec3(kPhosphorBoxRadius));

    // top/middle/bottom row
    float rt_y = 0.;
    float rtt_y = -0.25;
    float rtb_y = 0.25;
    float rm_y = 0.5;
    float rb_y = 1.;
    float rbt_y = 0.75;
    float rbb_y = 1.25;

    float rt_dist_y = abs(rt_y - texel_frac.y);
    float rtt_dist_y = abs(rtt_y - texel_frac.y);
    float rtb_dist_y = abs(rtb_y - texel_frac.y);
    float rm_dist_y = abs(rm_y - texel_frac.y);
    float rb_dist_y = abs(rb_y - texel_frac.y);
    float rbt_dist_y = abs(rbt_y - texel_frac.y);
    float rbb_dist_y = abs(rbb_y - texel_frac.y);

    vec3 result = vec3(0.0);

    float w = 0.25 * (length(ddx * size.xy) + length(ddy * size.xy));

    vec3 phosphor_heights_00 = kPhosphorHeightBase + kPhosphorHeightScale*tex_00;
    vec3 phosphor_heights_01 = kPhosphorHeightBase + kPhosphorHeightScale*tex_01;
    vec3 phosphor_heights_10 = kPhosphorHeightBase + kPhosphorHeightScale*tex_10;
    vec3 phosphor_heights_11 = kPhosphorHeightBase + kPhosphorHeightScale*tex_11;

    // Correct for dimmer colors having less area for sampling by boosting them
    tex_00 *= kPhosphorHeightMax/phosphor_heights_00;
    tex_01 *= kPhosphorHeightMax/phosphor_heights_01;
    tex_10 *= kPhosphorHeightMax/phosphor_heights_10;
    tex_11 *= kPhosphorHeightMax/phosphor_heights_11;

    vec3 distances_s_00 = max(vec3(0.), vec3(rt_dist_y) - phosphor_heights_00*(1. - kPhosphorSpread));
    vec3 distances_s_10 = max(vec3(0.), vec3(rt_dist_y) - phosphor_heights_10*(1. - kPhosphorSpread));
    vec3 distances_s_01 = max(vec3(0.), vec3(rb_dist_y) - phosphor_heights_01*(1. - kPhosphorSpread));
    vec3 distances_s_11 = max(vec3(0.), vec3(rb_dist_y) - phosphor_heights_11*(1. - kPhosphorSpread));

    float strobe_d = 7.;
    vec3 dist_half_lim_00 = 0.5*(kPhosphorSpread*phosphor_heights_00 + vec3(kPhosphorRadius));
    vec3 dist_half_lim_01 = 0.5*(kPhosphorSpread*phosphor_heights_01 + vec3(kPhosphorRadius));
    vec3 dist_half_lim_10 = 0.5*(kPhosphorSpread*phosphor_heights_10 + vec3(kPhosphorRadius));
    vec3 dist_half_lim_11 = 0.5*(kPhosphorSpread*phosphor_heights_11 + vec3(kPhosphorRadius));
    vec3 strobe_step_00 = max(dist_half_lim_00, strobe_d*w);
    vec3 strobe_step_01 = max(dist_half_lim_01, strobe_d*w);
    vec3 strobe_step_10 = max(dist_half_lim_10, strobe_d*w);
    vec3 strobe_step_11 = max(dist_half_lim_11, strobe_d*w);
    vec3 strobe_00 = smoothstep(dist_half_lim_00 + strobe_step_00,
                                dist_half_lim_00 - strobe_step_00,
                                distances_s_00);
    vec3 strobe_01 = smoothstep(dist_half_lim_01 + strobe_step_01,
                                dist_half_lim_01 - strobe_step_01,
                                distances_s_01);
    vec3 strobe_10 = smoothstep(dist_half_lim_10 + strobe_step_10,
                                dist_half_lim_10 - strobe_step_10,
                                distances_s_10);
    vec3 strobe_11 = smoothstep(dist_half_lim_11 + strobe_step_11,
                                dist_half_lim_11 - strobe_step_11,
                                distances_s_11);

    // strobe_00 = pow(strobe_00, vec3(0.5));
    // strobe_01 = pow(strobe_01, vec3(0.5));
    // strobe_10 = pow(strobe_10, vec3(0.5));
    // strobe_11 = pow(strobe_11, vec3(0.5));

    vec3 mid_t = vec3(params.PHOSPHOR_MIDPOINT_T);
    result += CenterLit(tex_00, cl_dist_x, rt_dist_y, w, phosphor_heights_00, strobe_00) + 
              SplitLit(mix(tex_00, tex_10, mid_t), cm_dist_x, rtt_dist_y, rt_dist_y, rtb_dist_y, w,
                       mix(phosphor_heights_00, phosphor_heights_10, mid_t),
                       mix(strobe_00, strobe_10, mid_t)) +
              CenterLit(tex_10, cr_dist_x, rt_dist_y, w, phosphor_heights_10, strobe_10) +
              EdgeLit(tex_00, tex_01, cl_dist_x, rt_dist_y, rm_dist_y, rb_dist_y, w,
                      phosphor_heights_00, phosphor_heights_01, strobe_00, strobe_01) +
              EdgeLit(tex_10, tex_11, cr_dist_x, rt_dist_y, rm_dist_y, rb_dist_y, w,
                      phosphor_heights_10, phosphor_heights_11, strobe_10, strobe_11) +
              CenterLit(tex_01, cl_dist_x, rb_dist_y, w, phosphor_heights_01, strobe_01) + 
              SplitLit(mix(tex_01, tex_11, mid_t), cm_dist_x, rbt_dist_y, rb_dist_y, rbb_dist_y, w,
                       mix(phosphor_heights_01, phosphor_heights_11, mid_t),
                       mix(strobe_01, strobe_11, mid_t)) +
              CenterLit(tex_11, cr_dist_x, rb_dist_y, w, phosphor_heights_11, strobe_11);

    result *= min(1.,kPhosphorRadius/w);

    result.rgb *= CornerMask(pos, 300., aspect_ratio) * params.PHOSPHOR_SCALE;
    return result;
}

vec3 Diffusion(sampler2D diffusion_texture, vec2 ddx, vec2 ddy, vec2 pos, vec4 size, float aspect_ratio) {
	highp vec2 texel_real = pos * size.xy;
	highp vec2 texel_center = floor(texel_real)+0.5;
	highp vec2 texel_frac = (texel_real - texel_center);
    vec4 texture_sample = texture(diffusion_texture, pos + vec2(0.5*(params.PHOSPHOR_MIDPOINT_T - 0.5), 0.)*size.zw);
	vec3 diffusion = DecodeColor(texture_sample) *
                     CornerMask(pos, 100., aspect_ratio);
    float brightness = dot(diffusion, RGB_to_Y);
    float bias = mix(0.175, 0.05, sqrt(brightness));
    float scanline_distance = (2.*abs(texel_frac.y));
    float w = length(ddy*size.xy);
    float t = 0.55;
    float lim = 0.45;
    float s = 24.;
    float d = max(w*s, lim);
    float strobe = smoothstep(t+d, t-d, scanline_distance);
    strobe = mix(0.15, 1., strobe);
    return diffusion * vec3(strobe) * params.DIFFUSION_SCALE;
}

// wolfram: "derivative of [c_1,c_2]*([x,y]+[x*c_3,y*c_4]*(x*x+y*y))"
// solution:
// 
// ddx = [c_1*(c_3*(3x^2+y^2)+1),c_2*c_4*2*x*y] * dx
// ddy = [c_1*c_3*2*x*y,c_2*(c_4*(x^2+3*y^2)+1)] * dy
// 
// where: correction=c_1,c_2; distortion=c_3,c_4
vec2 Warp(vec2 coord, vec2 distortion, vec2 correction, vec2 dxy, 
          out vec2 ddx, out vec2 ddy) {
    coord -= vec2(0.5);
    vec2 squared = coord * coord;
    float rsq = squared.x + squared.y;
    ddx = correction * vec2(
        distortion.x*(rsq+2.0*squared.x) + 1.0,
        distortion.y*2.0*coord.x*coord.y) * vec2(dxy.x, 0.);
    ddy = correction * vec2(
        distortion.x*2.0*coord.x*coord.y,
        distortion.y*(rsq+2.0*squared.y) + 1.0) * vec2(0., dxy.y);
    coord += coord * (distortion * rsq);
    coord *= correction;
    return coord + vec2(0.5);
}

// Filmic tone mapping by Jim Hejl and Richard Burgess-Dawson. Note this outputs in sRGB.
vec3 Tonemap(vec3 linear_color) {
   linear_color *= params.EXPOSURE;
   vec3 x = max(vec3(0.),linear_color - 0.004);
   return (x*(6.2*x + .5))/(x*(6.2*x + 1.7) + 0.06);
}

vec4 CrtColor(sampler2D phosphor_texture, sampler2D diffusion_texture) {
	mediump vec4 result = vec4(0);
	vec2 dxy = params.OutputSize.zw * params.DEBUG_ZOOM;
	highp vec2 phosphor_ddx, phosphor_ddy;
	vec2 phosphor_pos = Warp(vTexCoord.xy, vPhosphorCurvature.xy, vPhosphorCurvature.zw, dxy, phosphor_ddx, phosphor_ddy);
	highp vec2 diffusion_ddx, diffusion_ddy;
	vec2 diffusion_pos = Warp(vTexCoord.xy, vDiffusionCurvature.xy, vDiffusionCurvature.zw, dxy, diffusion_ddx, diffusion_ddy);

	float aspect_ratio = params.OutputSize.y/params.OutputSize.x;
	result.rgb = Phosphor(phosphor_texture, phosphor_ddx, phosphor_ddy, phosphor_pos, params.OriginalSize, aspect_ratio);
	result.rgb += Diffusion(diffusion_texture, diffusion_ddx, diffusion_ddy, diffusion_pos, params.OriginalSize, aspect_ratio);
	
	// Apply tone mapping so overdriven colors appear less oversaturated.
	return vec4(Tonemap(result.rgb),1.);
}