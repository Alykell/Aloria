package fr.alykell.aloria.hud.cosmetics;

import com.mojang.blaze3d.platform.GlStateManager;
import java.util.HashMap;
import java.util.Map;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.render.entity.PlayerEntityRenderer;
import net.minecraft.client.render.entity.feature.FeatureRenderer;
import net.minecraft.client.render.entity.model.EntityModel;
import net.minecraft.client.render.model.ModelPart;

/**
 * Chapeaux d'Aloria sur la tête des joueurs (comme HeadFeatureRenderer du jeu). Mêmes cubes « box UV » que mod/ (HatLayer)
 * et l'aperçu du launcher, texture 64×32 : la tête va de y = -8 (dessus) à 0.
 */
public class HatFeature implements FeatureRenderer<AbstractClientPlayerEntity> {
	private static final Map<String, ModelPart> MODELS = new HashMap<>();
	private final PlayerEntityRenderer renderer;

	public HatFeature(PlayerEntityRenderer renderer) {
		this.renderer = renderer;
	}

	private static ModelPart model(String id) {
		if (MODELS.isEmpty()) {
			EntityModel owner = new EntityModel() {};
			ModelPart pumpkin = new ModelPart(owner, 0, 0).setTextureSize(64, 32);
			pumpkin.addCuboid(-5, -14, -5, 10, 6, 10);
			pumpkin.setTextureOffset(0, 16).addCuboid(-1, -17, -1, 2, 3, 2);
			MODELS.put("pumpkin_hat", pumpkin);
		}
		return MODELS.get(id);
	}

	// Méthodes redéfinies : noms MCP sous Forge (Mercury ne renomme pas les redéfinitions)
	@Override
	//#if FORGE
	//$$ public void doRenderLayer(AbstractClientPlayerEntity player, float handSwing, float handSwingAmount, float tickDelta, float age, float headYaw, float headPitch, float scale) {
	//#else
	public void render(AbstractClientPlayerEntity player, float handSwing, float handSwingAmount, float tickDelta, float age, float headYaw, float headPitch, float scale) {
	//#endif
		if (player.isInvisible()) return;
		String hat = Cosmetics.hat(player.getUuid());
		if (hat == null) return;
		GlStateManager.color(1.0F, 1.0F, 1.0F, 1.0F);
		this.renderer.bindTexture(Cosmetics.texture(hat));
		GlStateManager.pushMatrix();
		if (player.isSneaking()) GlStateManager.translate(0.0F, 0.2F, 0.0F);
		this.renderer.getModel().head.preRender(0.0625F);
		model(hat).render(0.0625F);
		GlStateManager.popMatrix();
	}

	@Override
	//#if FORGE
	//$$ public boolean shouldCombineTextures() {
	//#else
	public boolean combineTextures() {
	//#endif
		return false;
	}
}
