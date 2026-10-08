package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.Stats;
import net.minecraft.client.network.ClientPlayerInteractionManager;
import net.minecraft.entity.Entity;
import net.minecraft.entity.player.PlayerEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Coup porté à une entité : mesure du Reach */
@Mixin(ClientPlayerInteractionManager.class)
public class AttackMixin {
	@Inject(method = "attackEntity", at = @At("HEAD"))
	private void aloriahud$attack(PlayerEntity player, Entity target, CallbackInfo ci) {
		Stats.onAttack(player, target);
	}
}
