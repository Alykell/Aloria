package fr.alykell.aloria.hud.mixin;

import com.llamalad7.mixinextras.sugar.Local;
import com.mojang.blaze3d.vertex.PoseStack;
import fr.alykell.aloria.hud.Visual;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Place et taille des mains et du bouclier en vue à la première personne.
 * La classe a changé de nom en 26.3 (ItemInHandRenderer → FirstPersonHandsAndItemsRenderer) et ses paramètres aussi :
 * on vise les deux noms, et les paramètres utiles sont repérés par leur type.
 */
//#if MC >= 260000
@Pseudo
@Mixin(targets = {"net.minecraft.client.renderer.FirstPersonHandsAndItemsRenderer", "net.minecraft.client.renderer.ItemInHandRenderer"})
//#else
//$$ @Mixin(net.minecraft.client.renderer.ItemInHandRenderer.class)
//#endif
public class HandsMixin {
	//#if MC >= 260000
	@Inject(method = "submitArmWithItem", at = @At(value = "INVOKE", target = "Lcom/mojang/blaze3d/vertex/PoseStack;pushPose()V", shift = At.Shift.AFTER))
	//#else
	//$$ @Inject(method = "renderArmWithItem", at = @At(value = "INVOKE", target = "Lcom/mojang/blaze3d/vertex/PoseStack;pushPose()V", shift = At.Shift.AFTER))
	//#endif
	private void aloriahud$moveHand(CallbackInfo ci, @Local(argsOnly = true) InteractionHand hand, @Local(argsOnly = true) ItemStack stack,
		@Local(argsOnly = true) PoseStack pose) {
		Visual.transformHand(pose, hand, stack);
	}
}
