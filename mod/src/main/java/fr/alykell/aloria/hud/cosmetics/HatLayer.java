package fr.alykell.aloria.hud.cosmetics;

import com.mojang.blaze3d.vertex.PoseStack;
import java.util.Map;
import java.util.UUID;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.world.entity.Entity;
//#if MC >= 12109
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.rendertype.RenderTypes;
//#elseif MC >= 12102
//$$ import net.minecraft.client.model.PlayerModel;
//$$ import net.minecraft.client.renderer.MultiBufferSource;
//$$ import net.minecraft.client.renderer.RenderType;
//$$ import net.minecraft.client.renderer.entity.state.PlayerRenderState;
//#else
//$$ import net.minecraft.client.model.PlayerModel;
//$$ import net.minecraft.client.player.AbstractClientPlayer;
//$$ import net.minecraft.client.renderer.MultiBufferSource;
//$$ import net.minecraft.client.renderer.RenderType;
//#endif

/**
 * Chapeaux d'Aloria sur la tête des joueurs (comme les oreilles de deadmau5 du jeu). Modèles en cubes « box UV » sur une
 * texture 64×32, les mêmes que l'aperçu du launcher (src/renderer/src/cosmetics.ts) : la tête va de y = -8 (dessus) à 0.
 */
//#if MC >= 12109
public class HatLayer extends RenderLayer<AvatarRenderState, PlayerModel> {
//#elseif MC >= 12102
//$$ public class HatLayer extends RenderLayer<PlayerRenderState, PlayerModel> {
//#else
//$$ public class HatLayer extends RenderLayer<AbstractClientPlayer, PlayerModel<AbstractClientPlayer>> {
//#endif
	private static final Map<String, ModelPart> MODELS = Map.of("pumpkin_hat", pumpkinHat());

	private static ModelPart pumpkinHat() {
		MeshDefinition mesh = new MeshDefinition();
		mesh.getRoot().addOrReplaceChild(
			"pumpkin",
			CubeListBuilder.create().texOffs(0, 0).addBox(-5, -14, -5, 10, 6, 10).texOffs(0, 16).addBox(-1, -17, -1, 2, 3, 2),
			PartPose.ZERO
		);
		return LayerDefinition.create(mesh, 64, 32).bakeRoot();
	}

	//#if MC >= 12109
	public HatLayer(RenderLayerParent<AvatarRenderState, PlayerModel> parent) {
	//#elseif MC >= 12102
	//$$ public HatLayer(RenderLayerParent<PlayerRenderState, PlayerModel> parent) {
	//#else
	//$$ public HatLayer(RenderLayerParent<AbstractClientPlayer, PlayerModel<AbstractClientPlayer>> parent) {
	//#endif
		super(parent);
	}

	/** Joueur d'un état de rendu (les états ne gardent que l'id de l'entité) */
	private static UUID uuidOf(int entityId) {
		Minecraft mc = Minecraft.getInstance();
		Entity entity = mc.level == null ? null : mc.level.getEntity(entityId);
		return entity == null ? null : entity.getUUID();
	}

	//#if MC >= 12109
	@Override
	public void submit(PoseStack poseStack, SubmitNodeCollector collector, int light, AvatarRenderState state, float yRot, float xRot) {
		if (state.isInvisible) return;
		UUID id = uuidOf(state.id);
		String hat = id == null ? null : Cosmetics.hat(id);
		if (hat == null) return;
		poseStack.pushPose();
		this.getParentModel().head.translateAndRotate(poseStack);
		collector.submitModelPart(
			MODELS.get(hat), poseStack, RenderTypes.entityCutout(Cosmetics.texture(hat)), light, LivingEntityRenderer.getOverlayCoords(state, 0.0F), null
		);
		poseStack.popPose();
	}
	//#elseif MC >= 12102
	//$$ @Override
	//$$ public void render(PoseStack poseStack, MultiBufferSource buffers, int light, PlayerRenderState state, float yRot, float xRot) {
	//$$ 	if (state.isInvisible) return;
	//$$ 	UUID id = uuidOf(state.id);
	//$$ 	String hat = id == null ? null : Cosmetics.hat(id);
	//$$ 	if (hat == null) return;
	//$$ 	poseStack.pushPose();
	//$$ 	this.getParentModel().head.translateAndRotate(poseStack);
	//$$ 	MODELS.get(hat).render(poseStack, buffers.getBuffer(RenderType.entityCutout(Cosmetics.texture(hat))), light, LivingEntityRenderer.getOverlayCoords(state, 0.0F));
	//$$ 	poseStack.popPose();
	//$$ }
	//#else
	//$$ @Override
	//$$ public void render(PoseStack poseStack, MultiBufferSource buffers, int light, AbstractClientPlayer player, float limbSwing, float limbSwingAmount, float partialTick, float ageInTicks, float netHeadYaw, float headPitch) {
	//$$ 	if (player.isInvisible()) return;
	//$$ 	String hat = Cosmetics.hat(player.getUUID());
	//$$ 	if (hat == null) return;
	//$$ 	poseStack.pushPose();
	//$$ 	this.getParentModel().head.translateAndRotate(poseStack);
	//$$ 	MODELS.get(hat).render(poseStack, buffers.getBuffer(RenderType.entityCutout(Cosmetics.texture(hat))), light, LivingEntityRenderer.getOverlayCoords(player, 0.0F));
	//$$ 	poseStack.popPose();
	//$$ }
	//#endif
}
