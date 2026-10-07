package fr.alykell.aloria.hud.mixin;

import net.minecraft.client.network.ClientPlayerInteractionManager;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** Avancement du bloc en cours de minage (0 à 1). */
@Mixin(ClientPlayerInteractionManager.class)
public interface InteractionManagerAccessor {
	@Accessor("currentBreakingProgress")
	float getCurrentBreakingProgress();
}
