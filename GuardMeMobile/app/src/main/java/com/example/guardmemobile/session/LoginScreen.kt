package com.example.guardmemobile.session

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.example.guardmemobile.R
import com.example.guardmemobile.ui.components.GuardLogo
import com.example.guardmemobile.ui.components.GuardPrimaryButton
import com.example.guardmemobile.ui.components.GuardWordmark
import com.example.guardmemobile.ui.theme.Body
import com.example.guardmemobile.ui.theme.GuardColor
import com.example.guardmemobile.ui.theme.Meta
import com.example.guardmemobile.ui.theme.ScreenTitle

@Composable
fun LoginScreen(
    state: SessionUiState,
    onEmail: (String) -> Unit,
    onPassword: (String) -> Unit,
    onLogin: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxSize()
            .background(GuardColor.Cream)
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp, vertical = 22.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        GuardLogo(Modifier.size(40.dp, 44.dp))
        GuardWordmark()
        Text(stringResource(R.string.login_title), color = GuardColor.Navy, style = ScreenTitle)
        Text(stringResource(R.string.login_body), color = GuardColor.WarmGray, style = Body)
        OutlinedTextField(
            value = state.email,
            onValueChange = onEmail,
            modifier = Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.login_email)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
        )
        OutlinedTextField(
            value = state.password,
            onValueChange = onPassword,
            modifier = Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.login_password)) },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        )
        if (state.error != null) {
            Text(state.error, color = GuardColor.DangerText, style = Meta)
        }
        GuardPrimaryButton(
            text = if (state.loading) stringResource(R.string.login_loading) else stringResource(R.string.login_action),
            subtitle = stringResource(R.string.login_hint),
            onClick = onLogin,
            enabled = !state.loading,
        )
        Text(stringResource(R.string.login_demo_hint), color = GuardColor.WarmGray, style = Meta)
    }
}
