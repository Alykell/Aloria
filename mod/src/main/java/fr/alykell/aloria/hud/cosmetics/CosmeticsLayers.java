package fr.alykell.aloria.hud.cosmetics;

import net.minecraft.client.renderer.entity.RenderLayerParent;
//#if MC >= 260000
import net.fabricmc.fabric.api.client.rendering.v1.LivingEntityRenderLayerRegistrationCallback;
//#else
//$$ import net.fabricmc.fabric.api.client.rendering.v1.LivingEntityFeatureRendererRegistrationCallback;
//#endif
//#if MC >= 12109
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
//#else
//$$ import net.minecraft.client.renderer.entity.player.PlayerRenderer;
//#endif

/** Ajoute le calque des chapeaux d'Aloria au rendu des joueurs (la cape passe par CapeMixin) */
public final class CosmeticsLayers {
	private CosmeticsLayers() {}

	@SuppressWarnings({ "unchecked", "rawtypes" })
	public static void register() {
		//#if MC >= 260000
		LivingEntityRenderLayerRegistrationCallback.EVENT.register((type, renderer, helper, context) -> {
		//#else
		//$$ LivingEntityFeatureRendererRegistrationCallback.EVENT.register((type, renderer, helper, context) -> {
		//#endif
			//#if MC >= 12109
			if (renderer instanceof AvatarRenderer<?>) helper.register(new HatLayer((RenderLayerParent) renderer));
			//#else
			//$$ if (renderer instanceof PlayerRenderer) helper.register(new HatLayer((RenderLayerParent) renderer));
			//#endif
		});
	}
}
