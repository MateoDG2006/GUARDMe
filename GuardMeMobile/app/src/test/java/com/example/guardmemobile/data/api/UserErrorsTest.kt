package com.example.guardmemobile.data.api

import com.example.guardmemobile.R
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.IOException

class UserErrorsTest {
    @Test
    fun mapsBackendCodesNetworkAndUnknown() {
        assertEquals(R.string.err_bad_credentials, errorRes(ApiException("INVALID_EMAIL_OR_PASSWORD", 401)))
        assertEquals(R.string.err_conflict, errorRes(ApiException("VERSION_CONFLICT", 409)))
        assertEquals(R.string.err_server, errorRes(ApiException("HTTP_502", 502)))
        assertEquals(R.string.err_network, errorRes(IOException("timeout")))
        assertEquals(R.string.err_generic, errorRes(ApiException("SOMETHING_NEW", 400)))
        assertEquals(R.string.err_generic, errorRes(IllegalStateException()))
    }
}
