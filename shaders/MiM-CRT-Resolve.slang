#version 450

#if defined(GL_ES) && (__VERSION__==300)
#define LAYOUT1(a)
#define LAYOUT2(a,b)
#define LAYOUT3(a,b,c)

precision mediump int;
precision mediump float;
#else
#define LAYOUT1(a) layout(a)
#define LAYOUT2(a,b) layout(a,b)
#define LAYOUT3(a,b,c) layout(a,b,c)
#endif

#define MITM_WEIGHT_X_SAMPLES 2
#define MITM_WEIGHT_Y_SAMPLES 2
#define TONEMAP

//#define DEBUG_PASS0
//#define DEBUG_PASS1
//#define DEBUG_PASS2
//#define DEBUG_TEST_PATTERN

#if defined(PARAMETER_UNIFORM)
#pragma parameter PHOSPHOR_SCALE "Phosphor Scale" 0.6 0.0 1.5 0.05
#pragma parameter PIXEL_HALF_WIDTH "Phosphor half-width" 0.40 0.0 1.0 0.01
#pragma parameter PIXEL_HALF_HEIGHT "Phosphor half-height" 0.30 0.0 1.0 0.01
#pragma parameter INNER_CURVATURE_X "Phosphor horizontal curvature" 0.15 0.0 1.0  0.01
#pragma parameter INNER_CURVATURE_Y "Phosphor vertical curvature"   0.10 0.0 1.0  0.01
#pragma parameter INNER_CORRECTION_SCALE "Phosphor curvature correction"   1.0 0.0 3.0  0.01

#pragma parameter HALATION_SCALE "Halation Scale" 0.75 0.0 5.0 0.05
#pragma parameter HALATION_FALLOFF "Halation decay power" 7.0 1.0 20.0 0.5

#pragma parameter DIFFUSION_SCALE "Diffusion Scale" 0.45 0.0 5.0 0.05
#pragma parameter OUTER_CURVATURE_X "Diffusion horizontal curvature" 0.15 0.0 1.0  0.01
#pragma parameter OUTER_CURVATURE_Y "Diffusion vertical curvature"   0.10 0.0 1.0  0.01
#pragma parameter OUTER_CORRECTION_SCALE "Diffusion curvature correction"   1.0 0.0 3.0  0.01
#pragma parameter DIFFUSION_THROW "Diffusion Throw" 1.5 0.1 5.0 0.1

#pragma parameter EXPOSURE "Exposure" 0.7 0.1 10.0 0.1

#pragma parameter DEBUG_ZOOM "Debug Zoom" 1.0 0.25 16.0 0.25
#pragma parameter DEBUG_PAN_X "Debug Pan (X)" 0.0 0.0 1.0 0.01
#pragma parameter DEBUG_PAN_Y "Debug Pan (Y)" 0.0 0.0 1.0 0.01
#endif

LAYOUT1(push_constant) uniform Push
{
	vec4 SourceSize;
	vec4 OriginalSize;
	vec4 OutputSize;
	uint FrameCount;
	float warpX;
	float warpY;
	float INNER_CURVATURE_X;
	float INNER_CURVATURE_Y;
	float INNER_CORRECTION_SCALE;
	float OUTER_CURVATURE_X;
	float OUTER_CURVATURE_Y;
	float OUTER_CORRECTION_SCALE;	
	float PHOSPHOR_SCALE;
	float PIXEL_HALF_WIDTH;
	float PIXEL_HALF_HEIGHT;
	float HALATION_SCALE;
	float HALATION_FALLOFF;
	float DIFFUSION_SCALE;
	float DIFFUSION_THROW;
	float EXPOSURE;
	float DEBUG_ZOOM;
	float DEBUG_PAN_X;
	float DEBUG_PAN_Y;
} params;

LAYOUT3(std140, set = 0, binding = 0) uniform UBO
{
	mat4 MVP;
} global;

#pragma stage vertex

LAYOUT1(location = 0) in vec4 Position;
LAYOUT1(location = 1) in vec2 TexCoord;
LAYOUT1(location = 0) out vec2 vTexCoord;
LAYOUT1(location = 1) out flat vec4 vInnerCurvature;
LAYOUT1(location = 2) out flat vec4 vOuterCurvature;

void main() {
   gl_Position = global.MVP * Position;
   //vTexCoord = TexCoord;
   vTexCoord.xy = TexCoord.xy / params.DEBUG_ZOOM + vec2(params.DEBUG_PAN_X, params.DEBUG_PAN_Y);

	vInnerCurvature = vec4(
		vec2(params.INNER_CURVATURE_X, params.INNER_CURVATURE_Y),
		1.0 / (1. + 0.125 * params.INNER_CORRECTION_SCALE * vec2(max(params.INNER_CURVATURE_X, params.INNER_CURVATURE_Y))));
	vOuterCurvature = vec4(
		vec2(params.OUTER_CURVATURE_X, params.OUTER_CURVATURE_Y),
		1.0 / (1. + 0.125 * params.OUTER_CORRECTION_SCALE * vec2(max(params.OUTER_CURVATURE_X, params.OUTER_CURVATURE_Y))));


}

#pragma stage fragment

precision mediump int;
precision mediump float;

LAYOUT1(location = 0) in vec2 vTexCoord;
LAYOUT1(location = 1) in flat vec4 vInnerCurvature;
LAYOUT1(location = 2) in flat vec4 vOuterCurvature;
LAYOUT1(location = 0) out vec4 FragColor;
LAYOUT2(set = 0, binding = 2) uniform sampler2D Source;
LAYOUT2(set = 0, binding = 3) uniform sampler2D FirstPass;

#if defined(DEBUG_PASS1)
LAYOUT2(set = 0, binding = 4) uniform sampler2D SecondPass;
#elif defined(DEBUG_PASS2)
LAYOUT2(set = 0, binding = 4) uniform sampler2D ThirdPass;
#endif

const mediump mat3 RGB_to_YIQ = mat3( 0.299 , 0.595716 , 0.211456 ,	0.587    , -0.274453 , -0.522591 ,		0.114    , -0.321263 , 0.311135 );
const mediump mat3 YIQ_to_RGB =   mat3( 1.0   , 1.0      , 1.0      ,	0.9563   , -0.2721   , -1.1070   ,		0.6210   , -0.6474   , 1.7046   );

// At the edge middles (e.g [0.5,0]), rsq will be 0.25, warp will be +0.125
vec2 Warp(vec2 coord, vec2 distortion, vec2 correction)
{
    coord -= vec2(0.5);
    float rsq = coord.x*coord.x + coord.y*coord.y;
    coord += coord * (distortion * rsq);
    coord *= correction;
    return coord + vec2(0.5);
}

float CornerMask(vec2 coord, float sharpness) {
	coord = (coord - vec2(.5))*1. + vec2(.5);
	coord = min(coord, vec2(1.) - coord)*vec2(1., params.SourceSize.y/params.SourceSize.x);
	vec2 cdist = vec2(.02);// alter value to change corner size
	coord = (cdist - min(coord, cdist));
	float dist = length(coord);
	return clamp((cdist.x - dist)*sharpness, 0., 1.);
}

float BoxArea(vec2 b_min, vec2 b_max) {
	return max(0., b_max.x - b_min.x) * max(0., b_max.y - b_min.y);
}

float IntersectedArea(vec2 b0_min, vec2 b0_max, vec2 b1_min, vec2 b1_max) {
	vec2 intersected_min = max(b0_min, b1_min);
	vec2 intersected_max = min(b0_max, b1_max);
	return BoxArea(intersected_min, intersected_max);
}

mediump vec4 ComputeSampleWeights(mediump vec2 sample_center, mediump vec2 sample_half_extents, 
								  mediump vec4 pminx,mediump vec4 pminy,mediump vec4 pmaxx,mediump vec4 pmaxy) {
	mediump vec2 sample_min = sample_center - sample_half_extents;
	mediump vec2 sample_max = sample_center + sample_half_extents;

	mediump vec4 int_minx = max(vec4(sample_min.x), pminx);
	mediump vec4 int_miny = max(vec4(sample_min.y), pminy);
	mediump vec4 int_maxx = min(vec4(sample_max.x), pmaxx);
	mediump vec4 int_maxy = min(vec4(sample_max.y), pmaxy);

	return max(vec4(0.),(int_maxx - int_minx)) * 
		   max(vec4(0.),(int_maxy - int_miny));
}

mediump vec4 ComputeNeighborWeights(mediump vec2 center, mediump vec2 ddx, mediump vec2 ddy, 
									mediump vec2 p00, mediump vec2 p01, mediump vec2 p10, mediump vec2 p11) {
	mediump vec2 corner = center - (ddx + ddy)/2.;
	const mediump float kOoSamplesX = 1./float(MITM_WEIGHT_X_SAMPLES);
	const mediump float kOoSamplesY = 1./float(MITM_WEIGHT_Y_SAMPLES);
	mediump vec2 fake_half_extents = vec2(length(ddx), length(ddy))/2.;
	mediump vec2 sample_half_extents = fake_half_extents * vec2(kOoSamplesX,kOoSamplesY);
	mediump vec2 pixel_half_extents = vec2(params.PIXEL_HALF_WIDTH/2., params.PIXEL_HALF_HEIGHT/2.);
	mediump vec4 px = vec4(p00.x, p01.x, p10.x, p11.x);
	mediump vec4 py = vec4(p00.y, p01.y, p10.y, p11.y);
	mediump vec4 pminx = px - vec4(pixel_half_extents.x);
	mediump vec4 pmaxx = px + vec4(pixel_half_extents.x);
	mediump vec4 pminy = py - vec4(pixel_half_extents.y);
	mediump vec4 pmaxy = py + vec4(pixel_half_extents.y);
	mediump vec4 summed_areas = vec4(0.);

#if MITM_WEIGHT_X_SAMPLES==2 && MITM_WEIGHT_Y_SAMPLES==2
	// Hardcoded loop unroll.
	const mediump float xf = 0.5 * kOoSamplesX;
	const mediump float yf = 0.5 * kOoSamplesY;
	mediump vec2 col0_offset = xf * ddx;	
	mediump vec2 col1_offset = col0_offset + ddx * kOoSamplesX;
	mediump vec2 row_start = corner + ddy * yf;
	summed_areas += ComputeSampleWeights(row_start + col0_offset, sample_half_extents, 
										 pminx, pminy, pmaxx, pmaxy);
	summed_areas += ComputeSampleWeights(row_start + col1_offset, sample_half_extents, 
										 pminx, pminy, pmaxx, pmaxy);
	row_start += ddy * kOoSamplesY;
	summed_areas += ComputeSampleWeights(row_start + col0_offset, sample_half_extents, 
										 pminx, pminy, pmaxx, pmaxy);
	summed_areas += ComputeSampleWeights(row_start + col1_offset, sample_half_extents, 
										 pminx, pminy, pmaxx, pmaxy);
#elif MITM_WEIGHT_X_SAMPLES==3 && MITM_WEIGHT_Y_SAMPLES==3
	// Hardcoded loop unroll.
	const mediump float xf = 0.5 * kOoSamplesX;
	const mediump float yf = 0.5 * kOoSamplesY;
	mediump vec2 col0_offset = xf * ddx;	
	mediump vec2 col1_offset = col0_offset + ddx * kOoSamplesX;
	mediump vec2 col2_offset = col1_offset + ddx * kOoSamplesX;
	mediump vec2 row_start = corner + ddy * yf;
	summed_areas += ComputeSampleWeights(row_start + col0_offset, sample_half_extents, 
										 pminx, pminy, pmaxx, pmaxy);
	summed_areas += ComputeSampleWeights(row_start + col1_offset, sample_half_extents, 
										 pminx, pminy, pmaxx, pmaxy);
	summed_areas += ComputeSampleWeights(row_start + col2_offset, sample_half_extents, 
										 pminx, pminy, pmaxx, pmaxy);
	row_start += ddy * kOoSamplesY;
	summed_areas += ComputeSampleWeights(row_start + col0_offset, sample_half_extents, 
										 pminx, pminy, pmaxx, pmaxy);
	summed_areas += ComputeSampleWeights(row_start + col1_offset, sample_half_extents, 
										 pminx, pminy, pmaxx, pmaxy);
	summed_areas += ComputeSampleWeights(row_start + col2_offset, sample_half_extents, 
										 pminx, pminy, pmaxx, pmaxy);
	row_start += ddy * kOoSamplesY;
	summed_areas += ComputeSampleWeights(row_start + col0_offset, sample_half_extents, 
										 pminx, pminy, pmaxx, pmaxy);
	summed_areas += ComputeSampleWeights(row_start + col1_offset, sample_half_extents, 
										 pminx, pminy, pmaxx, pmaxy);
	summed_areas += ComputeSampleWeights(row_start + col2_offset, sample_half_extents, 
										 pminx, pminy, pmaxx, pmaxy);
#else
	// Looping version.
	mediump float yf = 0.5 * kOoSamplesY;
	while (yf < 1.0) {
		mediump vec2 row_start = corner + ddy * yf;
		mediump float xf = 0.5 * kOoSamplesX; 
		while (xf < 1.0) {			
			mediump vec2 sample_center = row_start + ddx * xf;
			summed_areas += ComputeSampleWeights(sample_center, sample_half_extents, 
												 pminx, pminy, pmaxx, pmaxy);
			xf+= kOoSamplesX;
		}
		yf+= kOoSamplesY;
	}
#endif
	return summed_areas / (4.0*fake_half_extents.x*fake_half_extents.y);
}

/** The Prep pass encodes halation into the alpha channel; this applies it to the final color. */
mediump vec3 DecodeColor(mediump vec4 color) {
	mediump vec3 color_yiq = color.rgb * RGB_to_YIQ;
	color_yiq.r = max(color_yiq.r, params.HALATION_SCALE * color.a / params.HALATION_FALLOFF);
	return color_yiq * YIQ_to_RGB;
}

// Filmic tone mapping by Jim Hejl and Richard Burgess-Dawson. Note this outputs in sRGB.
vec3 Tonemap(vec3 linear_color) {
   linear_color *= params.EXPOSURE;
   vec3 x = max(vec3(0.),linear_color - 0.004);
   return (x*(6.2*x + .5))/(x*(6.2*x + 1.7) + 0.06);
}

vec4 CrtColor() {
	mediump vec4 result = vec4(0);
	const float kSquishScale = 1.05;
	vec2 pos = Warp(vTexCoord.xy, vInnerCurvature.xy, vInnerCurvature.zw);
	vec2 outer_texcoord = vTexCoord.xy;// + 0.25*params.OriginalSize.zw;
	vec2 outer_pos = Warp(outer_texcoord, vOuterCurvature.xy, vOuterCurvature.zw);

	const mediump vec4 in_gamma = vec4(vec3(2.2), 1.);
	const mediump vec4 out_gamma = vec4(vec3(1./2.2), 1.);

	mediump vec2 sampled_pixel_real = pos * params.OriginalSize.xy;
	ivec2 p00_ideal_corner = ivec2(floor(sampled_pixel_real - 0.5));
	mediump vec2 p00_ideal_center = vec2(p00_ideal_corner) + vec2(0.5,0.5);

	mediump vec2 posDx = dFdx(sampled_pixel_real);
	mediump vec2 posDy = dFdy(sampled_pixel_real);
	mediump vec2 p00_center = p00_ideal_center;
	mediump vec2 p10_ideal_center = p00_ideal_center + vec2(1.,0.);
	mediump vec2 p10_center = p10_ideal_center;
	mediump vec2 p01_center = p00_center + vec2(0.,1.);
	mediump vec2 p11_center = p10_center + vec2(0.,1.);
	mediump vec2 half_pixel_offset = vec2(0.25,0.);

	mediump vec4 weights = ComputeNeighborWeights(
		sampled_pixel_real, posDx, posDy, 
		p00_center-half_pixel_offset, p01_center-half_pixel_offset, 
		p10_center-half_pixel_offset, p11_center-half_pixel_offset);
	weights += ComputeNeighborWeights(
		sampled_pixel_real, posDx, posDy, 
		p00_center+half_pixel_offset, p01_center+half_pixel_offset, 
		p10_center+half_pixel_offset, p11_center+half_pixel_offset);

	if (weights.x > 0.) { // 0,0
		result.rgb += weights.x * DecodeColor(pow(texelFetch(FirstPass, p00_ideal_corner, 0), in_gamma));
	}
	if (weights.y > 0.) { // 0,1
		result.rgb += weights.y * DecodeColor(pow(texelFetchOffset(FirstPass, p00_ideal_corner, 0, ivec2(0,1)), in_gamma));
	}
	if (weights.z > 0.) { // 1,0
		result.rgb += weights.z * DecodeColor(pow(texelFetchOffset(FirstPass, p00_ideal_corner, 0, ivec2(1,0)), in_gamma));
	}
	if (weights.w > 0.) { // 1,1
		result.rgb += weights.w * DecodeColor(pow(texelFetchOffset(FirstPass, p00_ideal_corner, 0, ivec2(1,1)), in_gamma));
	}
	result *= params.PHOSPHOR_SCALE;

	result.rgb *= CornerMask(pos, 300.);

	highp vec2 blended_texcoord = outer_pos;
	highp vec2 blended_pixel = blended_texcoord * params.OriginalSize.xy;
	highp vec2 blended_center = floor(blended_pixel)+0.5;
	highp vec2 blended_offset = (blended_pixel - blended_center);
	// Extend the square [-0.5,0.5] to [-1,1], apply a power curve, return.
	vec2 skewed_offset = sign(blended_offset)*pow(2.*abs(blended_offset), vec2(params.DIFFUSION_THROW))*0.5;
	vec2 skewed_texcoord = (blended_center + skewed_offset) * params.OriginalSize.zw;
 	vec4 blendedSample = pow(texture(Source, skewed_texcoord), in_gamma);
	vec3 diffusion = params.DIFFUSION_SCALE*DecodeColor(blendedSample)*CornerMask(outer_pos, 100.);
	result.rgb += diffusion;
	
	#if defined(TONEMAP)
	// Apply tone mapping so overdriven colors don't appear oversaturated.
	return vec4(Tonemap(result.rgb),1.);//pow(result, out_gamma);
	#else
	return pow(result, out_gamma);
	#endif
}

void main() {
	vec4 result = vec4(vec3(0.), 1.);

#if defined(DEBUG_PASS0)
	vec2 pass_size = params.OriginalSize.xy;
	vec2 tc = gl_FragCoord.xy * params.OutputSize.zw / params.DEBUG_ZOOM + vec2(params.DEBUG_PAN_X, params.DEBUG_PAN_Y);
	ivec2 uv = ivec2(floor(tc * pass_size));
	result = texelFetch(FirstPass, uv, 0);
#elif defined(DEBUG_PASS1)
	vec2 pass_size = params.OriginalSize.xy;
	vec2 tc = gl_FragCoord.xy * params.OutputSize.zw / params.DEBUG_ZOOM + vec2(params.DEBUG_PAN_X, params.DEBUG_PAN_Y);
	ivec2 uv = ivec2(floor(tc * pass_size));
	result = texelFetch(SecondPass, uv, 0);
#elif defined(DEBUG_PASS2)
	vec2 pass_size = params.OriginalSize.xy;
	vec2 tc = gl_FragCoord.xy * params.OutputSize.zw / params.DEBUG_ZOOM + vec2(params.DEBUG_PAN_X, params.DEBUG_PAN_Y);
	ivec2 uv = ivec2(floor(tc * pass_size));
	result = texelFetch(ThirdPass, uv, 0);
#elif defined(DEBUG_TEST_PATTERN)
	result.r = 0.;
	result.b = 0.;
	result.g = 0.;
	vec2 op = floor(gl_FragCoord.xy);
	float offset = 0.4;
	float po2 = 2;
	while (po2 <= 256) {
		highp float x_odd = floor(mod(op.x/float(po2), 2.0));
		highp float y_odd = floor(mod(op.y/float(po2), 2.0));
		bool set = floor(mod((x_odd + y_odd), 2.0)) < 0.5;
		result.g+= set ? offset : 0.;
		po2*= 4;
		offset/= 2.;
	}
	result.r = mod(op.x,100.)/100.;
	result.b = mod(op.y,100.)/100.;
	result = pow(result, vec4(vec3(1./2.2),1.));
#else
	result = CrtColor();
#endif

	FragColor = result;
}
