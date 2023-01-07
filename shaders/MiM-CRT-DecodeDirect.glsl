
/** When running in single pass mode the source is non-sRGB and has no halation. */
mediump vec3 DecodeColor(mediump vec4 color) {
    vec4 src_degamma = vec4(vec3(params.SOURCE_GAMMA),1.0);
	return pow(color, src_degamma).rgb;
}
